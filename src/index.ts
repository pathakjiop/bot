/**
 * ============================================================================
 * MAIN ENTRY POINT (index.ts)
 * ============================================================================
 * 
 * Purpose:
 * Initializes the Hono application server, sets up middleware, establishes
 * database connections, initializes the WhatsApp client, and defines the
 * primary route handlers.
 * 
 * Flow:
 * 1. Define constants and ensure necessary directories exist.
 * 2. Initialize Hono app instance.
 * 3. Configure global middleware (Logger, CORS, JSON output).
 * 4. Serve static files (downloaded documents).
 * 5. Mount route modules.
 * 6. Define completion callback handlers for workers.
 * 7. Start the server and dependent services (Database, WhatsApp).
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { serveStatic } from 'hono/bun'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'
import { initializeDatabase, testDatabaseConnection } from './config/database.config'
import { whatsappClientService } from './services/whatsapp-client.service'

import paymentRoutes from './routes/payment.routes'
import modulesRoutes from './routes/modules.routes'
import testRoutes from './routes/test.routes'
import workerRoutes from './routes/worker.routes'

import { whatsappChatController } from './controllers/whatsapp-chat.controller'
import { sendCompletedDocumentToWhatsApp, type DocType } from './services/document-send.service'

// ============================================================================
// CONSTANT PATHS & DIRECTORY SETUP
// ============================================================================

const PROJECT_ROOT = process.cwd()

/**
 * Directory where downloaded documents (7/12, 8A, etc.) are stored temporarily.
 * These files are served statically to the user via WhatsApp or API response.
 */
const DOWNLOAD_DIR = path.join(
  PROJECT_ROOT,
  'downloads',
  'satBara'
)

// Ensure download directory exists to prevent file write errors later.
if (!existsSync(DOWNLOAD_DIR)) {
  mkdirSync(DOWNLOAD_DIR, { recursive: true })
  console.log('📁 Created download directory:', DOWNLOAD_DIR)
}

// ============================================================================
// APP INIT
// ============================================================================

const app = new Hono()

// ============================================================================
// MIDDLEWARE CONFIGURATION
// ============================================================================

// Log all requests to the console
app.use('*', logger())

// Enable Cross-Origin Resource Sharing (CORS) for external access
app.use('*', cors())

// Prettify JSON responses in non-production environments for easier debugging
if (process.env.NODE_ENV !== 'production') {
  app.use('*', prettyJSON())
}

// Ensure WhatsApp session storage exists to persist authentication state
if (!existsSync('./whatsapp-session')) {
  mkdirSync('./whatsapp-session', { recursive: true })
}

// ============================================================================
// STATIC FILE SERVING
// ============================================================================

// ============================================================================
// STATIC FILE VISIBILITY
// ============================================================================

// Expose downloaded files publicly via HTTP so they can be sent as links
// or accessed by the WhatsApp service for media uploads.
app.use(
  '/files/7-12',
  serveStatic({
    root: DOWNLOAD_DIR,
    rewriteRequestPath: (p) => {
      console.log('📁 Serving static file:', p)
      return p.replace(/^\/files\/7-12\//, '')
    }
  })
)

// ============================================================================
// ROUTES
// ============================================================================

app.get('/health', (c) =>
  c.json({
    status: 'OK',
    runtime: 'Bun',
    timestamp: new Date().toISOString()
  })
)

// WhatsApp Admin
app.get('/whatsapp/status', (c) => whatsappChatController.getStatus(c))
app.post('/whatsapp/send-test', (c) => whatsappChatController.sendTestMessage(c))
app.post('/whatsapp/broadcast', (c) => whatsappChatController.broadcastMessage(c))
app.get('/whatsapp/sessions', (c) => whatsappChatController.getSessions(c))
app.post('/whatsapp/clear-session', (c) => whatsappChatController.clearSession(c))

// Main modules routes
app.route('/modules', modulesRoutes)
app.route('/worker', workerRoutes)
app.route('/payment', paymentRoutes)

// Optional: Mount the worker app if you want to expose its endpoints
// Note: workerApp contains its own routes, mount at a different path to avoid conflicts
// app.route('/worker-api', workerApp)

if (process.env.NODE_ENV !== 'production') {
  app.route('/test', testRoutes)
}

// ============================================================================
// UNIFIED COMPLETION ENDPOINTS (PDF SEND VIA document-send.service)
// ============================================================================
// Worker calls /complete with doc_type for all types. Legacy paths redirect to it.

// ============================================================================
// WORKER CALLBACK HANDLERS
// ============================================================================

/**
 * Handles completion callbacks from background workers (Python/Node scrapers).
 * 
 * Flow:
 * 1. Validates input (request_id, status, doc_type).
 * 2. Normalizes `doc_type` if not explicitly provided (supports legacy paths).
 * 3. Invokes `sendCompletedDocumentToWhatsApp` to notify the user.
 * 
 * @param c Hono context
 * @return JSON response indicating success or failure.
 */
async function handleComplete(c: any) {
  const body = await c.req.json()
  let { doc_type, request_id, status, pdf_url } = body

  // Validate required fields
  if (!request_id || !status) {
    return c.json({ error: 'Missing required fields: request_id, status' }, 400)
  }

  // Infer doc_type if missing (backward compatibility for legacy worker calls)
  if (!doc_type) {
    if (body.service) doc_type = body.service
    else if (c.req.path.includes('7-12')) doc_type = '7_12'
    else if (c.req.path.includes('property-card')) doc_type = 'property_card'
    else if (c.req.path.includes('ferfar')) doc_type = 'ferfar'
    else if (c.req.path.includes('8a')) doc_type = '8a'
  }

  if (!doc_type) {
    return c.json({ error: 'Missing doc_type (or service)' }, 400)
  }

  // Validate document type against allowed enum
  const validTypes: DocType[] = ['property_card', 'ferfar', '7_12', '8a']
  if (!validTypes.includes(doc_type as DocType)) {
    return c.json({ error: 'Invalid doc_type' }, 400)
  }

  // Delegate processing to service layer
  const result = await sendCompletedDocumentToWhatsApp(
    doc_type as DocType,
    Number(request_id),
    pdf_url || '',
    status
  )

  if (!result.success) {
    // Return 404 for invalid IDs, 500 for other system errors
    return c.json({ error: result.error || 'Failed' }, result.error === 'Request not found' ? 404 : 500)
  }

  return c.json({ success: true })
}

// Register completion endpoints (Unified + Type-specific aliases)
app.post('/complete', handleComplete)
app.post('/7-12/complete', handleComplete)
app.post('/property-card/complete', handleComplete)
app.post('/ferfar/complete', handleComplete)
app.post('/8a/complete', handleComplete)

// ============================================================================
// SERVER START
// ============================================================================

// ============================================================================
// SERVER INITIALIZATION
// ============================================================================

const PORT = Number(process.env.PORT) || 3000

/**
 * Starts the application server and dependent services.
 * 
 * Sequence:
 * 1. Test Database Connectivity.
 * 2. Initialize Database Schema (if needed).
 * 3. Initialize WhatsApp Client (and QR code generation).
 * 4. Log server start status.
 */
async function startServer() {
  await testDatabaseConnection()
  await initializeDatabase()
  await whatsappClientService.initialize()
  
  // NOTE: RabbitMQ initialization is handled within modules.service.ts
  // when specific services are invoked, or potentially lazily loaded.

  console.log(`🚀 Server running on http://localhost:${PORT}`)
}

startServer()

export default {
  port: PORT,
  fetch: app.fetch
}