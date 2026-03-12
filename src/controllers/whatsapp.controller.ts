/**
 * ============================================================================
 * WHATSAPP CONTROLLER
 * ============================================================================
 * Handles the POST /webhook/whatsapp endpoint.
 *
 * Responsibilities:
 *  1. Parse incoming JSON payload from 2Factor eWhatsApp API
 *  2. Extract: sender_phone_number, message_text, message_type, timestamp
 *  3. Validate required fields
 *  4. Delegate to ChatbotFlow asynchronously (fire-and-forget)
 *  5. Return 200 immediately (webhook providers require fast ACK)
 *
 * Uses Hono Context – NOT Express Request/Response.
 */

import type { Context } from 'hono';
import { logger } from '../utils/logger';
import { ChatbotFlow } from '../flow/chatbot.flow';

/**
 * Shape of the payload expected from 2Factor eWhatsApp API.
 * Fields match the specification in INSTRUCTION.md §5.
 */
interface WebhookPayload {
  sender_phone_number?: string;
  message_text?: string;
  message_type?: string;
  timestamp?: string | number;
}

export class WhatsAppController {
  /**
   * Webhook handler for incoming WhatsApp messages.
   * Must always return HTTP 200 quickly; processing happens asynchronously.
   */
  static async handleWebhook(c: Context): Promise<Response> {
    try {
      logger.info('📨 Received webhook request');

      // Parse JSON body
      let payload: WebhookPayload;
      try {
        payload = await c.req.json<WebhookPayload>();
      } catch {
        logger.warn('⚠️  Could not parse webhook payload as JSON');
        return c.json({ status: 'ignored', reason: 'invalid_json' }, 200);
      }

      const {
        sender_phone_number,
        message_text,
        message_type = 'text',
        timestamp,
      } = payload;

      // Validate required fields
      if (!sender_phone_number || !message_text) {
        logger.warn('⚠️  Missing required webhook fields', {
          sender_phone_number: !!sender_phone_number,
          message_text: !!message_text,
        });
        return c.json({ status: 'ignored', reason: 'missing_fields' }, 200);
      }

      logger.info(
        `📩 ${message_type} from ${sender_phone_number}: "${message_text}" (ts: ${timestamp})`
      );

      // Fire-and-forget: process through the chatbot flow engine
      // We intentionally do NOT await here so that the webhook ACK is instant.
      ChatbotFlow.processMessage(sender_phone_number, message_text).catch(
        (err) => logger.error('❌ ChatbotFlow error:', err)
      );

      // Always ACK 200 to 2Factor API immediately
      return c.json({ status: 'received' }, 200);
    } catch (error) {
      logger.error('❌ Unexpected error in handleWebhook:', error);
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  }
}
