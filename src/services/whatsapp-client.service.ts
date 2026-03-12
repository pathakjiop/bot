/**
 * ============================================================================
 * WHATSAPP CLIENT SERVICE (whatsapp-web.js)
 * ============================================================================
 * 
 * Purpose:
 * Encapsulates the `whatsapp-web.js` library to provide a clean interface for
 * sending messages, handling events, and managing the WhatsApp session.
 * 
 * Key Responsibilities:
 * 1. Initialize and authenticate the WhatsApp client.
 * 2. Handle QR code generation and regeneration.
 * 3. Listen for incoming messages and route them to `sessionManager`.
 * 4. Send text messages, payment links, and documents (PDFs).
 * 5. Handle connection stability (reconnections, crashes).
 */

import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import { whatsappWebConfig } from '../config/whatsapp-web.config'
import { sessionManager } from './session-manager.service'
import { logger } from '../utils/logger'
import fs from 'fs'
import path from 'path'

class WhatsAppClientService {
  public client: Client | null = null
  private isReady = false
  private qrCode: string | null = null
  private initializationInProgress = false

  /**
   * Retrieves the current status of the WhatsApp client.
   * Used by the Admin API to check health and get QR codes.
   */
  getStatus() {
    return {
      isReady: this.isReady,
      qrCode: this.qrCode,
      initializationInProgress: this.initializationInProgress
    }
  }

  /**
   * Initialize WhatsApp client
   */
  async initialize(): Promise<void> {
    if (this.initializationInProgress) {
      logger.warn('⚠️ Initialization already in progress, skipping...')
      return
    }

    try {
      this.initializationInProgress = true
      logger.info('🚀 Initializing WhatsApp Client...')

      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: whatsappWebConfig.clientId,
          dataPath: whatsappWebConfig.sessionPath
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-notifications',
            '--disable-popup-blocking',
            '--disable-extensions',
            '--disable-default-apps',
            '--disable-translate',
            '--disable-background-networking',
            '--disable-sync',
            '--disable-web-resources',
            '--hide-scrollbars',
            '--mute-audio',
            '--window-size=1920,1080'
          ],
          defaultViewport: null,
          ignoreHTTPSErrors: true
        },
        qrMaxRetries: 5,
        takeoverOnConflict: true,
        restartOnAuthFail: true
      })

      this.setupEventHandlers()
      await this.client.initialize()

    } catch (error: any) {
      logger.error('❌ Failed to initialize WhatsApp client:', error.message)
      this.initializationInProgress = false
      setTimeout(() => {
        logger.info('🔄 Retrying initialization...')
        this.initialize().catch(console.error)
      }, 10000)
    }
  }

  /**
   * Setup all event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return

    this.client.on('qr', (qr: string) => {
      this.qrCode = qr
      logger.info('📱 QR Code Generated - Scan with WhatsApp:')
      qrcode.generate(qr, { small: whatsappWebConfig.qrDisplay.small })
    })

    this.client.on('ready', () => {
      this.isReady = true
      this.qrCode = null
      this.initializationInProgress = false
      logger.info('✅ WhatsApp Client is ready and authenticated!')
    })

    this.client.on('authenticated', () => {
      logger.info('🔐 WhatsApp authenticated successfully')
    })

    this.client.on('auth_failure', (msg: string) => {
      this.isReady = false
      this.initializationInProgress = false
      logger.error('❌ WhatsApp authentication failed:', msg)
    })

    this.client.on('disconnected', (reason: string) => {
      this.isReady = false
      this.initializationInProgress = false
      logger.warn('⚠️ WhatsApp client disconnected:', reason)
      setTimeout(() => {
        logger.info('🔄 Attempting to reconnect...')
        this.initialize().catch(console.error)
      }, 5000)
    })

    this.client.on('message', async (message: Message) => {
      await this.handleIncomingMessage(message)
    })
  }

  /**
   * Handles incoming messages from the WhatsApp network.
   * Filters out broadcasts, status updates, and own messages.
   * Delegates conversational logic to `sessionManager`.
   * 
   * @param message Raw WhatsApp message object
   */
  private async handleIncomingMessage(message: Message): Promise<void> {
    try {
      const from = message.from
      const body = message.body?.trim() || ''

      // Ignore broadcasts and statuses
      if (from === 'status@broadcast' || from.endsWith('@broadcast')) return;

      // Ignore bots own messages or empty messages (unless media)
      if (message.fromMe) return;

      // Check for PDF media
      if (message.hasMedia) {
        try {
          const media = await message.downloadMedia();
          if (media && media.mimetype === 'application/pdf') {
            const filename = `upload_${Date.now()}_${from.replace(/\D/g, '')}.pdf`;
            const uploadDir = path.join(process.cwd(), 'uploads', 'temp');

            if (!fs.existsSync(uploadDir)) {
              fs.mkdirSync(uploadDir, { recursive: true });
            }

            const filePath = path.join(uploadDir, filename);
            fs.writeFileSync(filePath, media.data, 'base64');

            console.log(`📄 PDF RECEIVED from ${from}: ${filePath}`);

            // Route to session manager for PDF handling
            const session = await sessionManager.getSession(from);
            await sessionManager.handlePdfMessage(from, filePath, session);
            return;
          }
        } catch (mediaError: any) {
          console.error('❌ Error downloading media:', mediaError.message);
        }
      }

      if (!body) return;

      console.log(`📨 Processing message from ${from}: "${body}"`)

      // Route through session manager
      const session = await sessionManager.getSession(from)
      await sessionManager.handleMessage(from, body, session)

    } catch (error: any) {
      console.error('❌ Error handling incoming message:', error.message)
    }
  }

  /**
   * Send text message with retry logic
   */
  async sendMessage(to: string, text: string): Promise<boolean> {
    try {
      if (!this.client || !this.isReady) return false

      let chatId = to.includes('@') ? to : `${to}@c.us`

      const maxRetries = 3
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await this.client.sendMessage(chatId, text)
          return true
        } catch (sendError: any) {
          if (sendError.message.includes('not logged in')) {
            this.isReady = false
            return false
          }
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
          }
        }
      }
      return false
    } catch (error: any) {
      console.error(`❌ Critical error sending message to ${to}:`, error.message)
      return false
    }
  }

  /**
   * Send payment link
   */
  /**
   * Constructs and sends a formatted payment request message.
   * Includes the Order ID and a direct link to the checkout page.
   * 
   * @param to Recipient phone number (format: 1234567890@c.us)
   * @param orderId Internal Order ID
   * @param amount Amount in Rupees
   * @param serviceName Name of the service being paid for
   */
  async sendPaymentLink(
    to: string,
    orderId: string,
    amount: number,
    serviceName: string
  ): Promise<boolean> {
    const baseUrl = process.env.BASE_URL || 'https://metopic-teethless-shin.ngrok-free.dev'
    const paymentUrl = `${baseUrl}/payment/checkout?orderId=${orderId}`

    const amountInRupees = Number(amount) || 0

    const message = `💳 *Payment Required*\n\n` +
      `📄 Service: ${serviceName}\n` +
      `💰 Amount: ₹${amountInRupees.toFixed(2)}\n` +
      `🆔 Order ID: ${orderId}\n\n` +
      `Please complete payment here:\n${paymentUrl}\n\n` +
      `⚠️ *Important:*\n` +
      `• Complete payment within 10 minutes\n` +
      `• Document will be delivered here automatically.`

    return this.sendMessage(to, message)
  }

  /**
   * Send PDF document
   */
  async sendDocument(
    to: string,
    filePath: string,
    filename: string,
    caption?: string
  ): Promise<boolean> {
    try {
      if (!this.client || !this.isReady) {
        console.error('❌ WhatsApp client not ready')
        return false
      }

      let chatId = to.includes('@') ? to : `${to.replace(/\D/g, '')}@c.us`
      const absolutePath = path.resolve(filePath)

      if (!fs.existsSync(absolutePath)) {
        console.error('❌ File not found:', absolutePath)
        return false
      }

      console.log(`📤 Sending Document to ${chatId}: ${absolutePath}`)
      const media = MessageMedia.fromFilePath(absolutePath)

      await this.client.sendMessage(chatId, media, { caption: caption || '' })

      console.log('✅ Document sent successfully')
      return true
    } catch (error: any) {
      console.error('❌ Error sending document:', error.message)
      return false
    }
  }

  isClientReady(): boolean {
    return this.isReady && this.client !== null
  }

  getQrCode(): string | null {
    return this.qrCode
  }

  async restart(): Promise<void> {
    logger.info('🔄 Restarting WhatsApp client...')
    if (this.client) await this.client.destroy()

    this.client = null
    this.isReady = false
    this.qrCode = null
    this.initializationInProgress = false

    await new Promise(resolve => setTimeout(resolve, 2000))
    await this.initialize()
  }

  async shutdown(): Promise<void> {
    if (this.client) await this.client.destroy()
    this.client = null
    this.isReady = false
    logger.info('✅ WhatsApp client shut down successfully')
  }
}

export const whatsappClientService = new WhatsAppClientService()