/**
 * ============================================================================
 * SERVER ENTRY POINT
 * ============================================================================
 * Bun's native HTTP server bootstrapper.
 * Imports the configured Hono app and starts the server.
 */

import { createApp } from './app';
import { config } from './config/env';
import { logger } from './utils/logger';

const app = createApp();

logger.info(`🚀 Server running on http://localhost:${config.PORT}`);
logger.info(`📡 Webhook available at POST http://localhost:${config.PORT}/webhook/whatsapp`);

export default {
  port: config.PORT,
  fetch: app.fetch,
};
