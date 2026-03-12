/**
 * ============================================================================
 * SESSION MANAGER SERVICE
 * ============================================================================
 * 
 * Purpose:
 * Core state machine for the WhatsApp chatbot.
 * Manages user sessions, navigation, form data collection, and context switching.
 * 
 * Flow:
 * 1. `handleMessage` receives text from `WhatsAppClientService`.
 * 2. Checks current session state (Service Selection -> Form Steps -> Confirmation).
 * 3. Updates session state in DB (`sessions` table).
 * 4. Sends appropriate response/prompt to user.
 */

import { sql } from '../config/database.config'
import { whatsappClientService } from './whatsapp-client.service'
import { paymentService } from './payment.service'
import { paymentConfig } from '../config/payment.config'
import { logger } from '../utils/logger'
import fs from 'fs'
import path from 'path'
import { MessageMedia } from 'whatsapp-web.js'
import menuData from '../../data/output.json'

// Interfaces for Menu Data Structure (District/Taluka/Village)
interface MenuItem {
  id: string
  display: string
  backend_value: string
}

interface MenuData {
  district_menu: MenuItem[]
  taluka_menu: Record<string, MenuItem[]>
  village_menu: Record<string, MenuItem[]>
}

const typedMenuData = menuData as MenuData

// Session State Interface
interface Session {
  phoneNumber: string
  currentService?: '7-12' | '8a' | 'property-card' | 'ferfar'
  currentStep?: string // e.g., 'district', 'taluka', 'awaiting_payment'
  formData: Record<string, any> // Variable storage for user inputs
  orderId?: string
  requestId?: number
  createdAt: Date
  updatedAt: Date
}

interface ServiceConfig {
  steps: string[]
  price: number
  requiredFields: string[]
  displayName: string
  usesMenuData: boolean // Whether this module uses the district/taluka/village menu
  fieldMappings?: Record<string, string> // Map frontend fields to DB fields
}

class SessionManagerService {
  private serviceConfigs: Record<string, ServiceConfig> = {
    '7-12': {
      steps: ['district', 'taluka', 'village', 'gat_no'],
      price: paymentConfig.formPrices['7-12'],
      requiredFields: ['district', 'taluka', 'village', 'gat_no'],
      displayName: '7/12 Form (सातबारा)',
      usesMenuData: true,
      fieldMappings: {
        'district': 'district',
        'taluka': 'taluka',
        'village': 'village',
        'gat_no': 'gat_no'
      }
    },
    '8a': {
      steps: ['district', 'taluka', 'village', 'gat_no'],
      price: paymentConfig.formPrices['8a'],
      requiredFields: ['district', 'taluka', 'village', 'gat_no'],
      displayName: '8A Form',
      usesMenuData: true,
      fieldMappings: {
        'district': 'district',
        'taluka': 'taluka',
        'village': 'village',
        'gat_no': 'gat_no'
      }
    },
    'property-card': {
      steps: ['region', 'district', 'office', 'village', 'cts_no'],
      price: paymentConfig.formPrices['property-card'],
      requiredFields: ['region', 'district', 'office', 'village', 'cts_no'],
      displayName: 'Property Card (मालमत्ता कार्ड)',
      usesMenuData: false, // Property Card doesn't use the same menu system
      fieldMappings: {
        'region': 'region',
        'district': 'district',
        'office': 'office',
        'village': 'village',
        'cts_no': 'gat_no' // Map to gat_no in DB
      }
    },
    'ferfar': {
      steps: ['district', 'taluka', 'village', 'mutation_no'],
      price: paymentConfig.formPrices.ferfar,
      requiredFields: ['district', 'taluka', 'village', 'mutation_no'],
      displayName: 'Ferfar (फेरफार)',
      usesMenuData: true,
      fieldMappings: {
        'district': 'district',
        'taluka': 'taluka',
        'village': 'village',
        'mutation_no': 'gat_no' // Map to gat_no in DB
      }
    }
  }

  // ==========================================
  // DB SESSION MANAGEMENT
  // ==========================================
  async getSession(phoneNumber: string): Promise<Session> {
    try {
      const result = await sql`
        INSERT INTO sessions (phone_number, data, started_at, updated_at)
        VALUES (${phoneNumber}, ${JSON.stringify({})}, NOW(), NOW())
        ON CONFLICT (phone_number) DO UPDATE SET updated_at = NOW()
        RETURNING *
      `

      if (result && result.length > 0) {
        const session = result[0]
        let formData = {}
        if (session.data) {
          try {
            formData = typeof session.data === 'string' ? JSON.parse(session.data) : session.data
          } catch (e) {
            formData = {}
          }
        }

        return {
          phoneNumber: session.phone_number,
          currentService: session.current_service as Session['currentService'],
          currentStep: session.step,
          formData: formData,
          orderId: session.order_id,
          requestId: session.request_id,
          createdAt: session.started_at,
          updatedAt: session.updated_at || session.started_at
        }
      }
      return { phoneNumber, formData: {}, createdAt: new Date(), updatedAt: new Date() }
    } catch (error: any) {
      return { phoneNumber, formData: {}, createdAt: new Date(), updatedAt: new Date() }
    }
  }

  async updateSession(phoneNumber: string, updates: Partial<Session>): Promise<void> {
    try {
      const current = await this.getSession(phoneNumber)
      const currentService = updates.currentService !== undefined ? updates.currentService : current.currentService
      const currentStep = updates.currentStep !== undefined ? updates.currentStep : current.currentStep

      await sql`
        UPDATE sessions 
        SET 
          current_service = ${currentService || null},
          step = ${currentStep || null},
          data = ${JSON.stringify(updates.formData || current.formData || {})}::jsonb,
          order_id = ${(updates.orderId !== undefined ? updates.orderId : current.orderId) || null},
          request_id = ${(updates.requestId !== undefined ? updates.requestId : current.requestId) || null},
          updated_at = NOW()
        WHERE phone_number = ${phoneNumber}
      `
    } catch (error: any) {
      logger.error('❌ Error updating session:', error.message)
    }
  }

  async clearSession(phoneNumber: string): Promise<void> {
    try {
      await sql`DELETE FROM sessions WHERE phone_number = ${phoneNumber}`
    } catch (error: any) {
      logger.error('Error clearing session:', error.message)
    }
  }

  /**
   * Cancel a session and notify worker
   */
  async cancelSession(phoneNumber: string): Promise<void> {
    try {
      const session = await this.getSession(phoneNumber);

      if (session.currentService && session.requestId) {
        const table = this.getTableName(session.currentService);
        await sql`UPDATE ${sql(table)} SET status = 'cancelled' WHERE id = ${session.requestId}`;
        logger.info(`🚫 Request ${session.requestId} marked as cancelled in DB`);
      }

      await this.clearSession(phoneNumber);

      await whatsappClientService.sendMessage(
        phoneNumber,
        "❌ *Session Cancelled.*\n\nYour current request has been stopped. You can type 'Hi' anytime to start a new search."
      );

    } catch (error: any) {
      logger.error('❌ Error cancelling session:', error.message);
      await whatsappClientService.sendMessage(phoneNumber, "An error occurred while cancelling your session.");
    }
  }

  /**
   * Get table name for a service
   */
  private getTableName(service: string): string {
    return `requests_${service.replace('-', '_')}`;
  }

  // ==========================================
  // MAIN MESSAGE HANDLER
  // ==========================================

  /**
   * Main entry point for processing incoming user messages.
   * Routes the message based on the user's current session state.
   * 
   * Handling Logic:
   * 1. Global Commands (Cancel, Hi/Menu).
   * 2. Step-specific handlers (Confirmation, Form Filling).
   * 3. Service Selection (Initial State).
   */
  async handleMessage(phoneNumber: string, message: string, session: Session): Promise<void> {
    const text = message.trim();
    const lowerText = text.toLowerCase();

    // Check for cancel commands
    if (['cancel', 'stop', 'exit'].includes(lowerText)) {
      await this.cancelSession(phoneNumber);
      return;
    }

    // Check for start commands
    if (['hi', 'hello', 'start', 'menu'].includes(lowerText)) {
      await this.clearSession(phoneNumber);
      await this.sendWelcomeMessage(phoneNumber);
      return;
    }

    // Handle confirmation step
    if (session.currentStep === 'awaiting_confirmation') {
      await this.handleConfirmation(phoneNumber, lowerText, session);
      return;
    }

    // Handle extraction confirmation step
    if (session.currentStep === 'awaiting_extraction_confirmation') {
      await this.handleExtractionConfirmation(phoneNumber, lowerText, session);
      return;
    }

    // Handle form steps
    if (session.currentService) {
      await this.handleFormStep(phoneNumber, text, session);
      return;
    }

    // Handle service selection
    await this.handleServiceSelection(phoneNumber, lowerText, session);
  }

  /**
   * Send welcome message
   */
  private async sendWelcomeMessage(phoneNumber: string): Promise<void> {
    const message = `🏛️ *Welcome to Land Records Bot*\n\n` +
      `Please select a service by typing the number:\n\n` +
      `1️⃣ *7/12 Form* (सातबारा) - ₹${paymentConfig.formPrices['7-12']}\n` +
      `2️⃣ *8A Form* - ₹${paymentConfig.formPrices['8a']}\n` +
      `3️⃣ *Property Card* (मालमत्ता कार्ड) - ₹${paymentConfig.formPrices['property-card']}\n` +
      `4️⃣ *Ferfar* (फेरफार) - ₹${paymentConfig.formPrices.ferfar}\n\n` +
      `_Type the number or name of the service._`;

    await whatsappClientService.sendMessage(phoneNumber, message);
  }

  /**
   * Handle service selection
   */
  private async handleServiceSelection(phoneNumber: string, text: string, session: Session): Promise<void> {
    let selectedService: Session['currentService'] | null = null;

    if (text.includes('1') || text.includes('7/12') || text.includes('712') || text.includes('सातबारा')) {
      selectedService = '7-12';
    } else if (text.includes('2') || text.includes('8a') || text.includes('8ए')) {
      selectedService = '8a';
    } else if (text.includes('3') || text.includes('property') || text.includes('मालमत्ता')) {
      selectedService = 'property-card';
    } else if (text.includes('4') || text.includes('ferfar') || text.includes('फेरफार')) {
      selectedService = 'ferfar';
    }

    if (selectedService) {
      const config = this.serviceConfigs[selectedService];
      const firstStep = config.steps[0];
      const newFormData = {};

      await this.updateSession(phoneNumber, {
        currentService: selectedService,
        currentStep: firstStep,
        formData: newFormData
      });

      const updatedSession = { ...session, currentService: selectedService, currentStep: firstStep, formData: newFormData };
      await this.sendStepMessage(phoneNumber, selectedService, firstStep, updatedSession);
    } else {
      await whatsappClientService.sendMessage(phoneNumber,
        "❌ Invalid selection. Please type:\n1 for 7/12\n2 for 8A\n3 for Property Card\n4 for Ferfar"
      );
    }
  }

  /**
   * Delegates specific form step handling based on the active service configuration.
   * Determines if the step requires menu validation (dropdowns) or custom input.
   */
  private async handleFormStep(phoneNumber: string, text: string, session: Session): Promise<void> {
    const config = this.serviceConfigs[session.currentService!];

    // Handle based on whether service uses menu data or not
    if (config.usesMenuData) {
      await this.handleMenuBasedStep(phoneNumber, text, session, config);
    } else {
      await this.handleCustomStep(phoneNumber, text, session, config);
    }
  }

  /**
   * Handle steps that use district/taluka/village menus (7-12, 8A, Ferfar)
   */
  private async handleMenuBasedStep(phoneNumber: string, text: string, session: Session, config: ServiceConfig): Promise<void> {
    let valueToStore = text.trim();
    const currentStep = session.currentStep!;

    // Validate and map dropdown selections
    if (currentStep === 'district') {
      const match = typedMenuData.district_menu.find((d: MenuItem) => d.id === valueToStore);
      if (!match) {
        const list = typedMenuData.district_menu.map(d => `${d.id}. ${d.display}`).join('\n');
        await whatsappClientService.sendMessage(phoneNumber,
          `❌ Invalid selection. Please pick a valid number from the list:\n\n${list}`
        );
        return;
      }
      valueToStore = match.backend_value;
    } else if (currentStep === 'taluka') {
      const districtName = session.formData.district;
      const talukas = typedMenuData.taluka_menu[districtName] || [];
      const match = talukas.find((t: MenuItem) => t.id === valueToStore);
      if (!match) {
        const list = talukas.map(t => `${t.id}. ${t.display}`).join('\n');
        await whatsappClientService.sendMessage(phoneNumber,
          `❌ Invalid selection. Please pick a valid number:\n\n${list}`
        );
        return;
      }
      valueToStore = match.backend_value;
    } else if (currentStep === 'village') {
      const talukaName = session.formData.taluka;
      const villages = typedMenuData.village_menu[talukaName] || [];
      const match = villages.find((v: MenuItem) => v.id === valueToStore);
      if (!match) {
        const list = villages.map(v => `${v.id}. ${v.display}`).join('\n');
        await whatsappClientService.sendMessage(phoneNumber,
          `❌ Invalid selection. Please pick a valid number:\n\n${list}`
        );
        return;
      }
      valueToStore = match.backend_value;
    }

    // Store the value
    const updatedFormData = { ...session.formData, [currentStep]: valueToStore };

    // Check if all required fields are filled
    const allRequiredFilled = config.requiredFields.every(f =>
      updatedFormData[f] && updatedFormData[f].toString().length > 0
    );

    if (allRequiredFilled) {
      // Map form data to database fields before initiating verification
      const dbFormData = this.mapFormDataToDb(session.currentService!, updatedFormData);
      await this.initiateVerification(phoneNumber, session.currentService!, dbFormData);
    } else {
      // Move to next step
      const currentStepIndex = config.steps.indexOf(currentStep);
      const nextStep = config.steps[currentStepIndex + 1];
      if (nextStep) {
        await this.updateSession(phoneNumber, { currentStep: nextStep, formData: updatedFormData });
        const updatedSession = { ...session, currentStep: nextStep, formData: updatedFormData };
        await this.sendStepMessage(phoneNumber, session.currentService!, nextStep, updatedSession);
      }
    }
  }

  /**
   * Handle custom steps for Property Card
   */
  private async handleCustomStep(phoneNumber: string, text: string, session: Session, config: ServiceConfig): Promise<void> {
    const currentStep = session.currentStep!;
    const valueToStore = text.trim();

    // For Property Card, we don't validate against menus - just store the input
    const updatedFormData = { ...session.formData, [currentStep]: valueToStore };

    // Check if all required fields are filled
    const allRequiredFilled = config.requiredFields.every(f =>
      updatedFormData[f] && updatedFormData[f].toString().length > 0
    );

    if (allRequiredFilled) {
      // Map form data to database fields
      const dbFormData = this.mapFormDataToDb(session.currentService!, updatedFormData);
      await this.initiateVerification(phoneNumber, session.currentService!, dbFormData);
    } else {
      // Move to next step
      const currentStepIndex = config.steps.indexOf(currentStep);
      const nextStep = config.steps[currentStepIndex + 1];
      if (nextStep) {
        await this.updateSession(phoneNumber, { currentStep: nextStep, formData: updatedFormData });
        const updatedSession = { ...session, currentStep: nextStep, formData: updatedFormData };
        await this.sendStepMessage(phoneNumber, session.currentService!, nextStep, updatedSession);
      }
    }
  }

  /**
   * Map frontend form data to database field names
   */
  private mapFormDataToDb(service: string, formData: Record<string, any>): Record<string, any> {
    const config = this.serviceConfigs[service];
    const dbData: Record<string, any> = {};

    for (const [frontendField, value] of Object.entries(formData)) {
      const dbField = config.fieldMappings?.[frontendField] || frontendField;
      dbData[dbField] = value;
    }

    return dbData;
  }

  /**
   * Handle confirmation step (Yes/No after verification)
   */
  private async handleConfirmation(phoneNumber: string, text: string, session: Session): Promise<void> {
    const config = this.serviceConfigs[session.currentService!];

    if (text === 'yes' || text === 'y') {
      // Create Razorpay Order
      const order = await paymentService.createOrder(session.currentService!, session.requestId!, phoneNumber);

      await this.updateSession(phoneNumber, {
        currentStep: 'awaiting_payment',
        orderId: order.id
      });

      await whatsappClientService.sendPaymentLink(phoneNumber, order.id, config.price, config.displayName);
      await whatsappClientService.sendMessage(phoneNumber,
        "_The worker is processing your request. Once you pay, the PDF will be sent automatically._"
      );
    }
    else if (text === 'no' || text === 'n') {
      const table = this.getTableName(session.currentService!);
      // Ensure requestId is treated as number or null explicitly if undefined
      const id = session.requestId ?? null;
      if (id) {
        await sql`UPDATE ${sql(table)} SET status = 'cancelled' WHERE id = ${id}`;
      }

      await whatsappClientService.sendMessage(phoneNumber,
        "❌ Request cancelled. You can type 'Hi' to start again."
      );
      await this.clearSession(phoneNumber);
    }
    else {
      await whatsappClientService.sendMessage(phoneNumber,
        "Please reply with *Yes* to proceed or *No* to cancel."
      );
    }
  }

  /**
   * Handle extraction confirmation (Yes/No after PDF extraction)
   */
  private async handleExtractionConfirmation(phoneNumber: string, text: string, session: Session): Promise<void> {
    if (['yes', 'y', 'confirm'].includes(text)) {
      // User accepted the extracted data. Proceed to verification.
      // We assume the service is '7-12' based on the extraction logic.

      const config = this.serviceConfigs['7-12'];

      // Ensure all required fields are present in formData
      // (The extraction script puts them there)

      // Map form data to database fields
      const dbFormData = this.mapFormDataToDb('7-12', session.formData);

      await whatsappClientService.sendMessage(phoneNumber, "✅ Details confirmed. Proceeding with verification...");
      await this.initiateVerification(phoneNumber, '7-12', dbFormData);

    } else if (['no', 'n'].includes(text)) {
      // User rejected extracted data. Fallback to manual entry.
      await whatsappClientService.sendMessage(phoneNumber,
        "❌ Okay, let's enter the details manually."
      );
      // Start 7-12 flow from scratch
      await this.handleServiceSelection(phoneNumber, "1", session);
    } else {
      await whatsappClientService.sendMessage(phoneNumber,
        "Please reply with *Yes* to confirm the details or *No* to enter manually."
      );
    }
  }

  /**
   * Handle incoming PDF message
   */
  async handlePdfMessage(phoneNumber: string, pdfPath: string, session: Session): Promise<void> {
    // 1. Notify user
    await whatsappClientService.sendMessage(phoneNumber, "📄 PDF received. Analyzing 7-12 document...");

    // 2. Execute Python script
    const { exec } = await import('child_process');
    const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'extract_712.py');

    // Use python command (assuming python is in PATH)
    exec(`python "${scriptPath}" "${pdfPath}"`, async (error: any, stdout: string, stderr: string) => {
      if (error) {
        logger.error(`Exec error: ${error}`);
        console.error(`Stderr: ${stderr}`);
        await whatsappClientService.sendMessage(phoneNumber, "❌ Failed to process PDF. Please try again or enter details manually.");
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());

        if (!result.success && result.error) {
          logger.error(`Extraction tool error: ${result.error}`);
          await whatsappClientService.sendMessage(phoneNumber, "❌ Could not extract data from the PDF.");
          return;
        }

        // 3. Store extracted data in session
        // We assume 7-12 service for this PDF
        await this.updateSession(phoneNumber, {
          currentService: '7-12',
          currentStep: 'awaiting_extraction_confirmation',
          formData: {
            ...session.formData, // Keep existing if any?
            pdf_path: pdfPath,
            district: result.District || '',
            taluka: result.Taluka || '',
            village: result.Village || '',
            gat_no: result.GatNumber || ''
          }
        });

        // 4. Send Confirmation Message
        const msg = `✅ *Extracted Data:*\n\n` +
          `📍 District: ${result.District}\n` +
          `🏘️ Taluka: ${result.Taluka}\n` +
          `🏡 Village: ${result.Village}\n` +
          `🔢 Gat No: ${result.GatNumber}\n\n` +
          `Is this correct?\nReply *Yes* to proceed, *No* to edit manually.`;

        await whatsappClientService.sendMessage(phoneNumber, msg);

      } catch (e) {
        logger.error("JSON Parse error from python script", e);
        console.log("Stdout was:", stdout); // Debugging
        await whatsappClientService.sendMessage(phoneNumber, "❌ Error parsing extracted data.");
      }
    });
  }

  /**
   * Send appropriate message for each step
   */
  private async sendStepMessage(phoneNumber: string, service: string, step: string, session?: Session): Promise<void> {
    let message = '';

    if (service === 'property-card') {
      // Property Card specific messages
      switch (step) {
        case 'region':
          message = '📍 *Step 1:* Please enter the *Region* name.\n_(Example: Pune, Nashik, etc.)_';
          break;
        case 'district':
          message = '🏛️ *Step 2:* Please enter the *District* name.';
          break;
        case 'office':
          message = '🏢 *Step 3:* Please enter the *Office/Tehsil* name.';
          break;
        case 'village':
          message = '🏡 *Step 4:* Please enter the *Village* name.';
          break;
        case 'cts_no':
          message = '🔢 *Step 5:* Please enter the *CTS Number / Survey Number*.\n_(Example: 1234 or 45/2)_';
          break;
      }
    } else {
      // Generic menu-based messages
      switch (step) {
        case 'district':
          const districtList = typedMenuData.district_menu.map(d => `${d.id}. ${d.display}`).join('\n');
          message = `📍 *Step 1:* Please select the *District* by typing the number:\n\n${districtList}`;
          break;
        case 'taluka':
          const districtName = session?.formData.district;
          const talukas = typedMenuData.taluka_menu[districtName] || [];
          const talukaList = talukas.map(t => `${t.id}. ${t.display}`).join('\n');
          message = `🏘️ *Step 2:* Select the *Taluka*:\n\n${talukaList}`;
          break;
        case 'village':
          const talukaName = session?.formData.taluka;
          const villages = typedMenuData.village_menu[talukaName] || [];
          const villageList = villages.map(v => `${v.id}. ${v.display}`).join('\n');
          message = `🏡 *Step 3:* Select the *Village*:\n\n${villageList}`;
          break;
        case 'gat_no':
          message = '🔢 *Step 4:* Enter the *Gat / Survey Number*.\n_(Example: 101 or 45/2)_';
          break;
        case 'mutation_no':
          message = '🔄 *Step 5:* Enter the *Mutation (Ferfar) Number*.';
          break;
      }
    }

    await whatsappClientService.sendMessage(phoneNumber, message);
  }

  // ==========================================
  // VERIFICATION & WORKER QUEUING
  // ==========================================

  /**
   * Initiatives the background verification process.
   * 1. Creates a Request record in the specific service table.
   * 2. Queues a task in RabbitMQ for the worker.
   * 3. Starts polling the database for status updates.
   */
  private async initiateVerification(phoneNumber: string, service: string, formData: Record<string, any>): Promise<void> {
    try {
      const request = await this.createServiceRequest(service, phoneNumber, formData);
      await this.updateSession(phoneNumber, { requestId: request.id, formData });

      await whatsappClientService.sendMessage(phoneNumber,
        "🔍 *Verifying Record...* Please wait while we check the official portal."
      );

      await this.queueTask(service, request.id, formData, phoneNumber);

      // Start polling DB for status
      this.startStatusPolling(phoneNumber, request.id, service);
    } catch (error) {
      logger.error('Verification initiation failed', error);
      await whatsappClientService.sendMessage(phoneNumber,
        "❌ Error connecting to backend systems. Please try again later."
      );
    }
  }

  private startStatusPolling(phoneNumber: string, requestId: number, service: string) {
    const table = this.getTableName(service);
    let attempts = 0;
    const maxAttempts = 30; // 30 * 4 seconds = 2 minutes max

    const interval = setInterval(async () => {
      attempts++;

      try {
        const [request] = await sql`SELECT status FROM ${sql(table)} WHERE id = ${requestId}`;

        if (request && request.status === 'pdf_verified') {
          clearInterval(interval);

          await this.updateSession(phoneNumber, { currentStep: 'awaiting_confirmation' });

          await whatsappClientService.sendMessage(phoneNumber,
            "✅ *Record Found!*\n\nI have successfully verified the details on the portal. Would you like to download the PDF for ₹" +
            this.serviceConfigs[service].price + "?\n\nReply with *Yes* or *No*."
          );
        }
        else if (request && (request.status === 'failed' || request.status === 'failed_not_found') || attempts > maxAttempts) {
          clearInterval(interval);
          await whatsappClientService.sendMessage(phoneNumber,
            "❌ Record not found or portal error. Please check the details and try again."
          );
          await this.clearSession(phoneNumber);
        }
      } catch (error) {
        logger.error('Error polling status:', error);
      }
    }, 4000); // Poll every 4 seconds
  }

  /**
   * Create service request in appropriate database table
   */
  private async createServiceRequest(service: string, whatsappId: string, formData: Record<string, any>): Promise<any> {
    const table = this.getTableName(service);

    let result;

    if (service === 'property-card') {
      // Property Card specific insert
      result = await sql`
        INSERT INTO ${sql(table)} 
        (region, district, office, village, cts_no, whatsapp_phone, status)
        VALUES (
          ${formData.region}, 
          ${formData.district}, 
          ${formData.office}, 
          ${formData.village}, 
          ${formData.gat_no}, 
          ${whatsappId}, 
          'verifying'
        )
        RETURNING *
      `;
    } else if (service === '7-12') {
      // 7-12 has sheet_no
      result = await sql`
        INSERT INTO ${sql(table)} 
        (district, taluka, village, gat_no, sheet_no, whatsapp_phone, status)
        VALUES (
          ${formData.district}, 
          ${formData.taluka}, 
          ${formData.village}, 
          ${formData.gat_no}, 
          ${formData.sheet_no || null}, 
          ${whatsappId}, 
          'verifying'
        )
        RETURNING *
      `;
    } else {
      // Default for 8a and ferfar
      result = await sql`
        INSERT INTO ${sql(table)} 
        (district, taluka, village, gat_no, whatsapp_phone, status)
        VALUES (
          ${formData.district}, 
          ${formData.taluka}, 
          ${formData.village}, 
          ${formData.gat_no}, 
          ${whatsappId}, 
          'verifying'
        )
        RETURNING *
      `;
    }

    return result[0];
  }

  /**
   * Queue task in RabbitMQ
   */
  private async queueTask(service: string, requestId: number, formData: any, phoneNumber: string): Promise<boolean> {
    try {
      const amqp = await import('amqplib');
      const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
      const channel = await conn.createChannel();

      let queueName;
      let payload;

      if (service === 'property-card') {
        queueName = 'property_card_queue';
        payload = {
          id: requestId,
          doc_type: 'property_card',
          region: formData.region,
          district: formData.district,
          office: formData.office,
          village: formData.village,
          cts_no: formData.gat_no,
          whatsapp_phone: phoneNumber
        };
      } else if (service === 'ferfar') {
        queueName = 'ferfar_queue';
        payload = {
          id: requestId,
          doc_type: 'ferfar',
          district: formData.district,
          taluka: formData.taluka,
          village: formData.village,
          gat_no: formData.gat_no,
          whatsapp_phone: phoneNumber
        };
      } else if (service === '7-12') {
        queueName = '7_12_queue';
        payload = {
          id: requestId,
          doc_type: '7_12',
          district: formData.district,
          taluka: formData.taluka,
          village: formData.village,
          gat_no: formData.gat_no,
          sheet_no: formData.sheet_no || null,
          whatsapp_phone: phoneNumber
        };
      } else if (service === '8a') {
        queueName = '8a_queue';
        payload = {
          id: requestId,
          doc_type: '8a',
          district: formData.district,
          taluka: formData.taluka,
          village: formData.village,
          gat_no: formData.gat_no,
          whatsapp_phone: phoneNumber
        };
      } else {
        return false;
      }

      channel.sendToQueue(queueName, Buffer.from(JSON.stringify(payload)), { persistent: true });

      setTimeout(() => {
        channel.close();
        conn.close();
      }, 500);

      logger.info(`📤 Task queued for ${service} - Request ID: ${requestId} in queue: ${queueName}`);
      return true;
    } catch (error) {
      logger.error('RabbitMQ Error', error);
      return false;
    }
  }

  /**
   * Handle payment success
   */
  async handlePaymentSuccess(phoneNumber: string, orderId: string): Promise<void> {
    try {
      const session = await this.getSession(phoneNumber);

      if (session.currentService && session.requestId) {
        const table = this.getTableName(session.currentService);
        await sql`UPDATE ${sql(table)} SET status = 'paid' WHERE id = ${session.requestId}`;
        logger.info(`💰 Request ${session.requestId} status set to PAID in ${table}`);
      }

      await whatsappClientService.sendMessage(
        phoneNumber,
        "✅ *Payment Received!* Thank you.\n\nYour document is now being generated. Please stay online, it will be sent to you shortly."
      );

      await this.updateSession(phoneNumber, {
        currentStep: 'processing_final_download'
      });
    } catch (error: any) {
      logger.error('❌ Error in handlePaymentSuccess:', error.message);
    }
  }

  // ==========================================
  // FINAL DOCUMENT DELIVERY
  // ==========================================
  async sendCompletedDocument(phoneNumber: string, service: string, requestId: number, pdfPath: string, filename: string): Promise<boolean> {
    try {
      const config = this.serviceConfigs[service];
      const caption = `✅ Your *${config.displayName}* is ready!\n\n📄 Request ID: ${requestId}\n\nThank you for using our service!`;

      const success = await whatsappClientService.sendDocument(phoneNumber, pdfPath, filename, caption);

      if (success) {
        const table = this.getTableName(service);
        await sql`
          UPDATE ${sql(table)} 
          SET status = 'completed', pdf_url = ${filename}, updated_at = NOW() 
          WHERE id = ${requestId}
        `;
        await this.clearSession(phoneNumber);
        return true;
      }
      return false;
    } catch (error: any) {
      logger.error('Failed to send final document', error);
      return false;
    }
  }
}

export const sessionManager = new SessionManagerService()