/**
 * ============================================================================
 * APP FACTORY
 * ============================================================================
 * Creates and configures the Hono application.
 *
 * Responsibilities:
 *  - Register global middleware (logger, CORS, pretty-JSON)
 *  - Mount all route modules
 *  - Expose a health check endpoint
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

import whatsappRoutes from './routes/whatsapp.routes';

export function createApp(): Hono {
  const app = new Hono();

  // ── Middleware ──────────────────────────────────────────────────────────────

  // HTTP request logger (prints method, path, status, latency)
  app.use('*', honoLogger());

  // Cross-Origin Resource Sharing – allow all origins (restrict in production)
  app.use('*', cors());

  // Pretty-print JSON in development for easier debugging
  if (process.env.NODE_ENV !== 'production') {
    app.use('*', prettyJSON());
  }

  // ── Health Check ────────────────────────────────────────────────────────────

  app.get('/health', (c) =>
    c.json({
      status: 'OK',
      runtime: 'Bun',
      framework: 'Hono',
      timestamp: new Date().toISOString(),
    })
  );

  // ── Routes ───────────────────────────────────────────────────────────────────

  // WhatsApp webhook & messaging routes mounted at /webhook
  app.route('/webhook', whatsappRoutes);

  // ── 404 Fallback ────────────────────────────────────────────────────────────

  app.notFound((c) => c.json({ error: 'Route not found' }, 404));

  // ── Global Error Handler ────────────────────────────────────────────────────

  app.onError((err, c) => {
    console.error('[FATAL]', err);
    return c.json({ error: 'Internal Server Error', message: err.message }, 500);
  });

  return app;
}
