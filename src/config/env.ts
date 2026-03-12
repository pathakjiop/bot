/**
 * ============================================================================
 * ENVIRONMENT CONFIGURATION
 * ============================================================================
 * Loads and validates all required environment variables.
 *
 * Required variables (as per INSTRUCTION.md §1):
 *   BASE_URL       - 2Factor eWhatsApp API base URL
 *   WABA_ID        - WhatsApp Business Account ID
 *   PHONE_NUMBER_ID - Registered WhatsApp phone number ID
 *   API_KEY        - API key from 2Factor dashboard
 *
 * Optional:
 *   PORT           - HTTP server port (default: 3000)
 *   NODE_ENV       - Runtime environment (default: development)
 *   LOG_LEVEL      - Logging verbosity (default: info)
 */

export const config = {
  // ── 2Factor eWhatsApp API ───────────────────────────────────────────────────
  BASE_URL: process.env.BASE_URL ?? 'https://ewhatsapp.2factor.in',
  WABA_ID: process.env.WABA_ID ?? '',
  PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID ?? '',
  API_KEY: process.env.API_KEY ?? '',

  // ── Server ──────────────────────────────────────────────────────────────────
  PORT: Number(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  // ── Logging ─────────────────────────────────────────────────────────────────
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
} as const;

// ── Startup Validation ────────────────────────────────────────────────────────

const REQUIRED: Array<keyof typeof config> = ['WABA_ID', 'PHONE_NUMBER_ID', 'API_KEY'];

for (const key of REQUIRED) {
  if (!config[key]) {
    console.warn(`⚠️  WARNING: Environment variable "${key}" is not set!`);
    console.warn(`   Set it in your .env file. See .env.example for reference.`);
  }
}
