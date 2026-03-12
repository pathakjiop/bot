/**
 * ============================================================================
 * CHATBOT FLOW ENGINE
 * ============================================================================
 * Processes incoming WhatsApp messages and manages conversation state.
 *
 * Architecture (ARCHITECTURE.md §3):
 *   Receive msg → Determine state → Execute logic → Send response
 *
 * Current implementation uses an in-memory per-session state map.
 * For production, replace with Redis or a database-backed session store.
 */

import { WhatsAppService } from '../services/whatsapp.service';
import { logger } from '../utils/logger';

// ── Types ────────────────────────────────────────────────────────────────────

type ConversationState =
  | 'idle'
  | 'awaiting_service'
  | 'awaiting_712_survey'
  | 'awaiting_8a_khata'
  | 'awaiting_property_district'
  | 'awaiting_ferfar_details';

interface SessionData {
  state: ConversationState;
  selectedService?: string;
  updatedAt: number;
}

// ── In-Memory Session Store ───────────────────────────────────────────────────

/**
 * Simple in-memory session map.
 * Key  = phone number
 * Value = SessionData
 *
 * NOTE: This resets on server restart.
 * Replace with Redis client in production for persistence & scaling.
 */
const sessions = new Map<string, SessionData>();

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getSession(phone: string): SessionData {
  const now = Date.now();
  const session = sessions.get(phone);

  // Return existing session if not expired
  if (session && now - session.updatedAt < SESSION_TTL_MS) {
    return session;
  }

  // Create fresh session (expired or first contact)
  const fresh: SessionData = { state: 'idle', updatedAt: now };
  sessions.set(phone, fresh);
  return fresh;
}

function updateSession(phone: string, data: Partial<SessionData>) {
  const session = sessions.get(phone) ?? { state: 'idle', updatedAt: 0 };
  sessions.set(phone, { ...session, ...data, updatedAt: Date.now() });
}

// ── Menu Messages ─────────────────────────────────────────────────────────────

const WELCOME_MENU = `👋 Hello! I'm here to help you with *land record services*.

Available services:

1️⃣  *7/12 Form* – ₹20
2️⃣  *8A Form* – ₹20
3️⃣  *Property Card* – ₹25
4️⃣  *Ferfar* – ₹30

Reply with a number (1-4) to select a service.`;

const HELP_MSG =
  "❓ I didn't understand that. Type *hi* to see the main menu.";

// ── Flow Engine ───────────────────────────────────────────────────────────────

export class ChatbotFlow {
  /**
   * Entry point for all incoming messages.
   * Determines the appropriate response based on the current session state.
   *
   * @param phoneNumber  Sender's phone number (international format)
   * @param messageText  Raw text received from the user
   */
  static async processMessage(
    phoneNumber: string,
    messageText: string
  ): Promise<void> {
    const normalized = messageText.trim().toLowerCase();
    const session = getSession(phoneNumber);

    logger.info(
      `🔄 Flow [${phoneNumber}] state="${session.state}" msg="${messageText}"`
    );

    // ── Global shortcuts ──────────────────────────────────────────────────────

    // Always allow reset to main menu
    if (normalized === 'hi' || normalized === 'hello' || normalized === 'menu') {
      updateSession(phoneNumber, { state: 'awaiting_service' });
      return ChatbotFlow.send(phoneNumber, WELCOME_MENU);
    }

    // ── State machine ─────────────────────────────────────────────────────────

    switch (session.state) {
      // ── Idle (first message that's not "hi") ──────────────────────────────
      case 'idle': {
        updateSession(phoneNumber, { state: 'awaiting_service' });
        return ChatbotFlow.send(phoneNumber, WELCOME_MENU);
      }

      // ── Awaiting service selection ────────────────────────────────────────
      case 'awaiting_service': {
        if (normalized === '1') {
          updateSession(phoneNumber, { state: 'awaiting_712_survey', selectedService: '7/12' });
          return ChatbotFlow.send(
            phoneNumber,
            '📋 You selected *7/12 Form* (₹20).\n\nPlease reply with your *survey number* to proceed.'
          );
        } else if (normalized === '2') {
          updateSession(phoneNumber, { state: 'awaiting_8a_khata', selectedService: '8A' });
          return ChatbotFlow.send(
            phoneNumber,
            '📋 You selected *8A Form* (₹20).\n\nPlease reply with your *Khata number* to proceed.'
          );
        } else if (normalized === '3') {
          updateSession(phoneNumber, { state: 'awaiting_property_district', selectedService: 'Property Card' });
          return ChatbotFlow.send(
            phoneNumber,
            '📋 You selected *Property Card* (₹25).\n\nPlease reply with your *district name* to proceed.'
          );
        } else if (normalized === '4') {
          updateSession(phoneNumber, { state: 'awaiting_ferfar_details', selectedService: 'Ferfar' });
          return ChatbotFlow.send(
            phoneNumber,
            '📋 You selected *Ferfar* (₹30).\n\nPlease reply with your *property details* (village, survey no.) to proceed.'
          );
        } else {
          return ChatbotFlow.send(
            phoneNumber,
            "⚠️ Please reply with *1, 2, 3, or 4* to select a service.\n\nType *hi* to see the menu again."
          );
        }
      }

      // ── Collecting 7/12 survey number ─────────────────────────────────────
      case 'awaiting_712_survey': {
        const surveyNo = messageText.trim();
        updateSession(phoneNumber, { state: 'idle' });
        return ChatbotFlow.send(
          phoneNumber,
          `✅ Received survey number: *${surveyNo}*\n\nYour *7/12 Form* request has been submitted!\n\nOur team will process it and send you the document shortly.\n\nType *hi* to start a new request.`
        );
      }

      // ── Collecting 8A khata number ────────────────────────────────────────
      case 'awaiting_8a_khata': {
        const khataNo = messageText.trim();
        updateSession(phoneNumber, { state: 'idle' });
        return ChatbotFlow.send(
          phoneNumber,
          `✅ Received Khata number: *${khataNo}*\n\nYour *8A Form* request has been submitted!\n\nOur team will process it and send you the document shortly.\n\nType *hi* to start a new request.`
        );
      }

      // ── Collecting Property Card district ─────────────────────────────────
      case 'awaiting_property_district': {
        const district = messageText.trim();
        updateSession(phoneNumber, { state: 'idle' });
        return ChatbotFlow.send(
          phoneNumber,
          `✅ Received district: *${district}*\n\nYour *Property Card* request has been submitted!\n\nOur team will process it and send you the document shortly.\n\nType *hi* to start a new request.`
        );
      }

      // ── Collecting Ferfar details ─────────────────────────────────────────
      case 'awaiting_ferfar_details': {
        const details = messageText.trim();
        updateSession(phoneNumber, { state: 'idle' });
        return ChatbotFlow.send(
          phoneNumber,
          `✅ Received property details: *${details}*\n\nYour *Ferfar* request has been submitted!\n\nOur team will process it and send you the document shortly.\n\nType *hi* to start a new request.`
        );
      }

      // ── Catch-all ─────────────────────────────────────────────────────────
      default: {
        updateSession(phoneNumber, { state: 'idle' });
        return ChatbotFlow.send(phoneNumber, HELP_MSG);
      }
    }
  }

  /** Convenience wrapper around WhatsAppService.sendTextMessage with error logging */
  private static async send(phone: string, message: string): Promise<void> {
    try {
      await WhatsAppService.sendTextMessage(phone, message);
    } catch (error) {
      logger.error(`❌ ChatbotFlow failed to send to ${phone}:`, error);
    }
  }
}
