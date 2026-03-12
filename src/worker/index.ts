import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import amqp from 'amqplib';
import sql from './db';
import { existsSync, mkdirSync } from 'fs';
import 'dotenv/config';

const app = new Hono();

let channel: amqp.Channel | null = null;

// -------------------------------------------------
// RABBITMQ INITIALIZATION
// -------------------------------------------------
async function initRabbitMQ() {
    try {
        const mqUrl = process.env.RABBITMQ_URL || 'amqp://localhost';
        const connection = await amqp.connect(mqUrl);
        channel = await connection.createChannel();
        
        // Declare all queues
        await channel.assertQueue('property_card_queue', { durable: true });
        await channel.assertQueue('ferfar_queue', { durable: true });
        await channel.assertQueue('7_12_queue', { durable: true });
        await channel.assertQueue('8a_queue', { durable: true });
        
        console.log("✅ RabbitMQ Connected - All Queues Ready");
    } catch (err) {
        console.error("❌ RabbitMQ Failed:", err);
        setTimeout(initRabbitMQ, 5000);
    }
}

initRabbitMQ();

// Create download directories
['property_card', 'ferfar', 'satBara'].forEach(dir => {
    const path = `./downloads/${dir}`;
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
});

// -------------------------------------------------
// PROPERTY CARD ENDPOINTS
// -------------------------------------------------
app.post('/property-card/request', async (c) => {
    try {
        const body = await c.req.json();
        const { region, district, office, village, cts_no, whatsapp_phone } = body;

        if (!region || !district || !office || !village || !cts_no || !whatsapp_phone) {
            return c.json({ error: 'Missing required fields' }, 400);
        }

        const result = await sql`
            INSERT INTO requests_property_card
            (region, district, office, village, cts_no, whatsapp_phone, status)
            VALUES (${region}, ${district}, ${office}, ${village}, ${cts_no}, ${whatsapp_phone}, 'pending_payment')
            RETURNING id
        `;

        return c.json({
            success: true,
            request_id: result[0].id,
            status: 'pending_payment'
        });
    } catch (err: any) {
        console.error("Property Card request error:", err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

app.post('/property-card/queue', async (c) => {
    try {
        const body = await c.req.json();
        const { request_id, region, district, office, village, cts_no, whatsapp_phone } = body;

        if (!request_id || !region || !district || !office || !village || !cts_no) {
            return c.json({ error: 'Missing required fields' }, 400);
        }

        await sql`
            UPDATE requests_property_card
            SET status = 'processing', updated_at = CURRENT_TIMESTAMP
            WHERE id = ${request_id}
        `;

        if (channel) {
            channel.sendToQueue(
                'property_card_queue',
                Buffer.from(JSON.stringify({
                    id: request_id,
                    doc_type: 'property_card',
                    region, district, office, village, cts_no, whatsapp_phone
                })),
                { persistent: true }
            );

            return c.json({ success: true, request_id, queued: true });
        }

        return c.json({ success: false, error: 'Queue unavailable' }, 503);
    } catch (err: any) {
        console.error("Queue error:", err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

app.post('/property-card/complete', async (c) => {
    try {
        const body = await c.req.json();
        const { request_id, status, pdf_url, phone } = body;

        await sql`
            UPDATE requests_property_card
            SET status = ${status}, pdf_url = ${pdf_url}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${request_id}
        `;

        console.log(`✅ Property Card Request ${request_id} completed`);

        return c.json({ success: true, request_id, status });
    } catch (err: any) {
        console.error("Complete request error:", err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

// -------------------------------------------------
// FERFAR ENDPOINTS
// -------------------------------------------------
app.post('/ferfar/request', async (c) => {
    try {
        const body = await c.req.json();
        const { district, taluka, village, mutation_no, whatsapp_phone } = body;

        if (!district || !taluka || !village || !mutation_no || !whatsapp_phone) {
            return c.json({ error: 'Missing required fields' }, 400);
        }

        const result = await sql`
            INSERT INTO requests_ferfar
            (district, taluka, village, mutation_no, whatsapp_phone, status)
            VALUES (${district}, ${taluka}, ${village}, ${mutation_no}, ${whatsapp_phone}, 'pending_payment')
            RETURNING id
        `;

        return c.json({
            success: true,
            request_id: result[0].id,
            status: 'pending_payment'
        });
    } catch (err: any) {
        console.error("Ferfar request error:", err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

app.post('/ferfar/queue', async (c) => {
    try {
        const body = await c.req.json();
        const { request_id, district, taluka, village, mutation_no, whatsapp_phone } = body;

        if (!request_id || !district || !taluka || !village || !mutation_no) {
            return c.json({ error: 'Missing required fields' }, 400);
        }

        await sql`
            UPDATE requests_ferfar
            SET status = 'processing', updated_at = CURRENT_TIMESTAMP
            WHERE id = ${request_id}
        `;

        if (channel) {
            channel.sendToQueue(
                'ferfar_queue',
                Buffer.from(JSON.stringify({
                    id: request_id,
                    doc_type: 'ferfar',
                    district, taluka, village, mutation_no, whatsapp_phone
                })),
                { persistent: true }
            );

            return c.json({ success: true, request_id, queued: true });
        }

        return c.json({ success: false, error: 'Queue unavailable' }, 503);
    } catch (err: any) {
        console.error("Queue error:", err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

app.post('/ferfar/complete', async (c) => {
    try {
        const body = await c.req.json();
        const { request_id, status, pdf_url, phone } = body;

        await sql`
            UPDATE requests_ferfar
            SET status = ${status}, pdf_url = ${pdf_url}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${request_id}
        `;

        console.log(`✅ Ferfar Request ${request_id} completed`);

        return c.json({ success: true, request_id, status });
    } catch (err: any) {
        console.error("Complete request error:", err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

// -------------------------------------------------
// 7-12 SATBARA ENDPOINTS
// -------------------------------------------------
app.post('/7-12/request', async (c) => {
    try {
        const body = await c.req.json();
        const { district, taluka, village, gat_no, sheet_no, whatsapp_phone } = body;

        if (!district || !taluka || !village || !gat_no || !whatsapp_phone) {
            return c.json({ error: 'Missing required fields' }, 400);
        }

        const result = await sql`
            INSERT INTO requests_7_12
            (district, taluka, village, gat_no, sheet_no, whatsapp_phone, status)
            VALUES (${district}, ${taluka}, ${village}, ${gat_no}, ${sheet_no || null}, ${whatsapp_phone}, 'pending_payment')
            RETURNING id
        `;

        return c.json({
            success: true,
            request_id: result[0].id,
            status: 'pending_payment'
        });
    } catch (err: any) {
        console.error("7-12 request error:", err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

app.post('/7-12/queue', async (c) => {
    try {
        const body = await c.req.json();
        const { request_id, district, taluka, village, gat_no, sheet_no, whatsapp_phone } = body;

        if (!request_id || !district || !taluka || !village || !gat_no) {
            return c.json({ error: 'Missing required fields' }, 400);
        }

        await sql`
            UPDATE requests_7_12
            SET status = 'processing', updated_at = CURRENT_TIMESTAMP
            WHERE id = ${request_id}
        `;

        if (channel) {
            channel.sendToQueue(
                '7_12_queue',
                Buffer.from(JSON.stringify({
                    id: request_id,
                    doc_type: '7_12',
                    district, taluka, village, gat_no, sheet_no, whatsapp_phone
                })),
                { persistent: true }
            );

            return c.json({ success: true, request_id, queued: true });
        }

        return c.json({ success: false, error: 'Queue unavailable' }, 503);
    } catch (err: any) {
        console.error("Queue error:", err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

app.post('/7-12/complete', async (c) => {
    try {
        const body = await c.req.json();
        const { request_id, status, pdf_url, phone } = body;

        await sql`
            UPDATE requests_7_12
            SET status = ${status}, pdf_url = ${pdf_url}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${request_id}
        `;

        console.log(`✅ 7-12 Request ${request_id} completed`);

        return c.json({ success: true, request_id, status });
    } catch (err: any) {
        console.error("Complete request error:", err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

// -------------------------------------------------
// 8A SATBARA ENDPOINTS
// -------------------------------------------------
app.post('/8a/request', async (c) => {
    try {
        const body = await c.req.json();
        const { district, taluka, village, gat_no, whatsapp_phone } = body;

        if (!district || !taluka || !village || !gat_no || !whatsapp_phone) {
            return c.json({ error: 'Missing required fields' }, 400);
        }

        const result = await sql`
            INSERT INTO requests_8a
            (district, taluka, village, gat_no, whatsapp_phone, status)
            VALUES (${district}, ${taluka}, ${village}, ${gat_no}, ${whatsapp_phone}, 'pending_payment')
            RETURNING id
        `;

        return c.json({
            success: true,
            request_id: result[0].id,
            status: 'pending_payment'
        });
    } catch (err: any) {
        console.error("8A request error:", err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

app.post('/8a/queue', async (c) => {
    try {
        const body = await c.req.json();
        const { request_id, district, taluka, village, gat_no, whatsapp_phone } = body;

        if (!request_id || !district || !taluka || !village || !gat_no) {
            return c.json({ error: 'Missing required fields' }, 400);
        }

        await sql`
            UPDATE requests_8a
            SET status = 'processing', updated_at = CURRENT_TIMESTAMP
            WHERE id = ${request_id}
        `;

        if (channel) {
            channel.sendToQueue(
                '8a_queue',
                Buffer.from(JSON.stringify({
                    id: request_id,
                    doc_type: '8a',
                    district, taluka, village, gat_no, whatsapp_phone
                })),
                { persistent: true }
            );

            return c.json({ success: true, request_id, queued: true });
        }

        return c.json({ success: false, error: 'Queue unavailable' }, 503);
    } catch (err: any) {
        console.error("Queue error:", err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

app.post('/8a/complete', async (c) => {
    try {
        const body = await c.req.json();
        const { request_id, status, pdf_url, phone } = body;

        await sql`
            UPDATE requests_8a
            SET status = ${status}, pdf_url = ${pdf_url}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${request_id}
        `;

        console.log(`✅ 8A Request ${request_id} completed`);

        return c.json({ success: true, request_id, status });
    } catch (err: any) {
        console.error("Complete request error:", err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

// -------------------------------------------------
// PAYMENT UPDATE ENDPOINT
// -------------------------------------------------
app.post('/payment/update', async (c) => {
    try {
        const body = await c.req.json();
        const { doc_type, request_id, payment_id } = body;

        if (!doc_type || !request_id || !payment_id) {
            return c.json({ error: 'Missing required fields' }, 400);
        }

        const tableMap: Record<string, string> = {
            'property_card': 'requests_property_card',
            'ferfar': 'requests_ferfar',
            '7_12': 'requests_7_12',
            '8a': 'requests_8a'
        };

        const tableName = tableMap[doc_type];
        if (!tableName) {
            return c.json({ error: 'Invalid doc_type' }, 400);
        }

        await sql`
            UPDATE ${sql(tableName)}
            SET status = 'paid', 
                payment_id = ${payment_id}, 
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${request_id}
        `;

        console.log(`💰 Payment confirmed for ${doc_type} request ${request_id}`);

        return c.json({ success: true, request_id, status: 'paid' });
    } catch (err: any) {
        console.error("Payment update error:", err);
        return c.json({ success: false, error: err.message }, 500);
    }
});

// -------------------------------------------------
// STATUS CHECK ENDPOINT
// -------------------------------------------------
app.get('/status/:doc_type/:id', async (c) => {
    try {
        const doc_type = c.req.param('doc_type');
        const id = parseInt(c.req.param('id'));

        if (!id) {
            return c.json({ error: 'Invalid request ID' }, 400);
        }

        const tableMap: Record<string, string> = {
            'property-card': 'requests_property_card',
            'ferfar': 'requests_ferfar',
            '7-12': 'requests_7_12',
            '8a': 'requests_8a'
        };

        const tableName = tableMap[doc_type];
        if (!tableName) {
            return c.json({ error: 'Invalid doc_type' }, 400);
        }

        const result = await sql`
            SELECT status, pdf_url, payment_id FROM ${sql(tableName)} WHERE id = ${id}
        `;

        if (result.length === 0) {
            return c.json({ status: 'not_found' }, 404);
        }

        return c.json(result[0]);
    } catch (err: any) {
        console.error("Status fetch error:", err);
        return c.json({ error: err.message }, 500);
    }
});

// -------------------------------------------------
// FILE SERVING ENDPOINTS
// -------------------------------------------------
app.use('/files/property-card/*', serveStatic({ root: './downloads/property_card' }));
app.use('/files/ferfar/*', serveStatic({ root: './downloads/ferfar' }));
app.use('/files/satbara/*', serveStatic({ root: './downloads/satBara' }));

// -------------------------------------------------
// HEALTH CHECK
// -------------------------------------------------
app.get('/health', (c) => {
    return c.json({ 
        status: 'ok', 
        rabbitmq: channel ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

export default app;

console.log("🚀 Unified Land Records Server Running");
console.log("📋 Endpoints:");
console.log("  POST /property-card/request  - Create Property Card request");
console.log("  POST /property-card/queue    - Queue Property Card task");
console.log("  POST /property-card/complete - Mark Property Card complete");
console.log("  POST /ferfar/request         - Create Ferfar request");
console.log("  POST /ferfar/queue           - Queue Ferfar task");
console.log("  POST /ferfar/complete        - Mark Ferfar complete");
console.log("  POST /7-12/request           - Create 7-12 request");
console.log("  POST /7-12/queue             - Queue 7-12 task");
console.log("  POST /7-12/complete          - Mark 7-12 complete");
console.log("  POST /8a/request             - Create 8A request");
console.log("  POST /8a/queue               - Queue 8A task");
console.log("  POST /8a/complete            - Mark 8A complete");
console.log("  POST /payment/update         - Update payment status");
console.log("  GET  /status/:doc_type/:id   - Check request status");
console.log("  GET  /health                 - Health check");