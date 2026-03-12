/**
 * ============================================================================
 * WHATSAPP WEBHOOK ROUTES
 * ============================================================================
 * Mounts the webhook endpoint consumed by 2Factor eWhatsApp API.
 *
 * Registered at prefix /webhook (see app.ts)
 * Final routes:
 *   POST /webhook/whatsapp   ← receives inbound messages from 2Factor API
 */

import { Hono } from 'hono';
import { WhatsAppController } from '../controllers/whatsapp.controller';

const whatsappRoutes = new Hono();

/**
 * POST /webhook/whatsapp
 * Receives inbound WhatsApp messages forwarded by 2Factor eWhatsApp.
 */
whatsappRoutes.post('/whatsapp', WhatsAppController.handleWebhook);

export default whatsappRoutes;