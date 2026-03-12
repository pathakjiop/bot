
## WhatsApp Chatbot System Architecture (Bun + Hono)

This document describes the **architecture of the WhatsApp chatbot backend**.

The system uses the **official WhatsApp Business API through 2Factor eWhatsApp**.

---

# 1. System Flow

```
User
 ↓
WhatsApp
 ↓
2Factor eWhatsApp API
 ↓
Webhook (Bun + Hono Backend)
 ↓
Flow Engine
 ↓
WhatsApp API
 ↓
User receives response
```

---

# 2. Architecture Diagram

```
              ┌───────────────┐
              │     User      │
              └───────┬───────┘
                      │
                      ▼
              ┌───────────────┐
              │   WhatsApp    │
              └───────┬───────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │ 2Factor eWhatsApp API   │
        └───────────┬─────────────┘
                    │
                    ▼
          ┌───────────────────┐
          │ Webhook Endpoint  │
          │ /webhook/whatsapp │
          └─────────┬─────────┘
                    │
                    ▼
            ┌───────────────┐
            │ Flow Engine   │
            │ Chatbot Logic │
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │ WhatsApp API  │
            │ Send Message  │
            └───────────────┘
```

---

# 3. Backend Components

## Webhook Handler

Receives incoming WhatsApp messages.

Responsibilities:

- Receive API events
    
- Parse message payload
    
- Extract message information
    
- Send message to flow engine
    

---

## Chatbot Flow Engine

Handles conversation logic.

Responsibilities:

- Understand user messages
    
- Determine conversation state
    
- Execute business logic
    
- Generate responses
    

---

## WhatsApp Message Service

Responsible for sending outgoing messages.

Responsibilities:

- Format API payload
    
- Send HTTP request to 2Factor API
    
- Handle API responses
    
- Handle errors
    

---

# 4. Project Structure

```
src/

  server.ts
  app.ts

  routes/
    whatsapp.routes.ts

  controllers/
    whatsapp.controller.ts

  services/
    whatsapp.service.ts

  flow/
    chatbot.flow.ts

  config/
    env.ts

  utils/
    logger.ts
```

---

# 5. Scalability Design

Future improvements may include:

- Redis queues
    
- Message workers
    
- Conversation database
    
- Admin dashboard
    
- Payment integration
    

---
