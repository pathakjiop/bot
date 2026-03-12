/**
 * ============================================================================
 * WHATSAPP MESSAGE SERVICE
 * ============================================================================
 * Handles all outbound message delivery via the 2Factor eWhatsApp API.
 *
 * API Specification (INSTRUCTION.md §2-3):
 *   POST {BASE_URL}/v1/messages
 *   Authorization: Bearer {API_KEY}
 *   Content-Type: application/json
 *
 * Uses Bun's built-in fetch – no axios dependency.
 */

import { config } from '../config/env';
import { logger } from '../utils/logger';

// ── Type Definitions ─────────────────────────────────────────────────────────

/** Template component parameter (text or currency etc.) */
interface TemplateParameter {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/** Raw 2Factor API response shape */
interface ApiResponse {
  message_id?: string;
  messages?: Array<{ id: string }>;
  error?: { code: number; message: string };
  [key: string]: unknown;
}

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Internal HTTP POST to 2Factor API.
 * Centralises auth headers, JSON serialisation, and error extraction.
 */
async function postToWhatsAppApi(payload: object): Promise<ApiResponse> {
  const url = `${config.BASE_URL}/v1/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  // Try to parse body even on error for diagnostic detail
  let data: ApiResponse;
  try {
    data = (await response.json()) as ApiResponse;
  } catch {
    data = {};
  }

  if (!response.ok) {
    const detail = data.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`2Factor API error: ${detail}`);
  }

  return data;
}

// ── Service Class ─────────────────────────────────────────────────────────────

export class WhatsAppService {
  /**
   * Send a plain text message to a WhatsApp user.
   *
   * @param phoneNumber  Recipient phone number in international format (e.g. "919876543210")
   * @param message      Text body to deliver
   */
  static async sendTextMessage(
    phoneNumber: string,
    message: string
  ): Promise<ApiResponse> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneNumber,
      type: 'text',
      text: {
        body: message,
      },
    };

    try {
      logger.info(`📤 Sending text → ${phoneNumber}`);
      const data = await postToWhatsAppApi(payload);
      const msgId = data.message_id ?? data.messages?.[0]?.id ?? 'no-id';
      logger.info(`✅ Text sent (id: ${msgId}) → ${phoneNumber}`);
      return data;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Failed to send text to ${phoneNumber}: ${msg}`);
      throw error;
    }
  }

  /**
   * Send a pre-approved template message to a WhatsApp user.
   *
   * @param phoneNumber   Recipient in international format
   * @param templateName  Approved template name from 2Factor dashboard
   * @param variables     Array of parameter objects for template body components
   */
  static async sendTemplateMessage(
    phoneNumber: string,
    templateName: string,
    variables: TemplateParameter[] = []
  ): Promise<ApiResponse> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneNumber,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_US' },
        components:
          variables.length > 0
            ? [{ type: 'body', parameters: variables }]
            : [],
      },
    };

    try {
      logger.info(`📤 Sending template [${templateName}] → ${phoneNumber}`);
      const data = await postToWhatsAppApi(payload);
      const msgId = data.message_id ?? data.messages?.[0]?.id ?? 'no-id';
      logger.info(`✅ Template sent (id: ${msgId}) → ${phoneNumber}`);
      return data;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(
        `❌ Failed to send template [${templateName}] to ${phoneNumber}: ${msg}`
      );
      throw error;
    }
  }
}
