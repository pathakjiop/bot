/**
 * ============================================================================
 * WHATSAPP CLIENT CONFIGURATION
 * ============================================================================
 * 
 * Purpose:
 * Configures the `whatsapp-web.js` client and the underlying Puppeteer browser.
 * Optimization focuses on resource efficiency and stability in server/container environments.
 */

export const whatsappWebConfig = {
  // Path where auth tokens/session data are stored
  sessionPath: './whatsapp-session',

  /**
   * Puppeteer Launch Options.
   * tuned for running in constrained environments (e.g., Docker, low memory VPS).
   */
  puppeteer: {
    headless: 'new',  // 'new' optimizes the headless mode implementation in newer Chrome versions
    args: [
      '--headless=new',                // Enforce new headless mode
      '--no-sandbox',                  // Required for running as root/docker
      '--disable-setuid-sandbox',      // Security relaxation for container support
      '--disable-dev-shm-usage',       // Prevent /dev/shm shared memory crashes
      '--disable-accelerated-2d-canvas', // Disable GPU acceleration for 2D canvas
      '--no-first-run',                // Skip First Run tasks
      '--no-zygote',                   // Disable zygote process for single-process management
      '--disable-gpu',                 // Disable GPU hardware acceleration entirely
      '--disable-notifications',       // Suppress browser notifications
      '--disable-popup-blocking',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-translate',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-web-resources',
      '--hide-scrollbars',
      '--mute-audio',
      '--remote-debugging-port=0',     // Security: Disable remote debug check
      '--remote-debugging-address=0.0.0.0',
      '--disable-software-rasterizer',
      '--disable-features=VizDisplayCompositor'
    ],
    defaultViewport: null, // Allow page to size to content
    ignoreHTTPSErrors: true
  },

  // Custom client ID for multi-session support
  clientId: 'land-records-bot',

  // Options for QR code generation in terminal
  qrDisplay: {
    small: true  // Compact ASCII QR code
  },

  // Auto-recovery strategies
  restartOnAuthFailure: true,
  takeoverOnConflict: false,   // Do not aggressively take over if another session is active
  takeoverTimeoutMs: 0
}