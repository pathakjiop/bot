
## WhatsApp Chatbot Integration Instructions

This project integrates with the **2Factor eWhatsApp API** to send and receive WhatsApp messages for the chatbot platform.

The backend must implement the **official WhatsApp API communication layer**.

---

# 1. Environment Configuration

Store the following credentials as **environment variables**.

```
BASE_URL=https://ewhatsapp.2factor.in
WABA_ID=<whatsapp_business_account_id>
PHONE_NUMBER_ID=<phone_number_id>
API_KEY=<api_key>
```

### Variable Description

|Variable|Description|
|---|---|
|BASE_URL|Base URL of 2Factor API|
|WABA_ID|WhatsApp Business Account ID|
|PHONE_NUMBER_ID|Registered WhatsApp phone number|
|API_KEY|API key from 2Factor dashboard|

---

# 2. WhatsApp Send Message API

All outgoing messages must be sent using:

```
POST {BASE_URL}/v1/messages
```

### Headers

```
Authorization: Bearer {API_KEY}
Content-Type: application/json
```

---

# 3. Send Text Message Example

### Request Body

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "<user_phone_number>",
  "type": "text",
  "text": {
    "body": "Hello! How can we help you today?"
  }
}
```

---

# 4. Backend Service Structure

Create a WhatsApp service module.

```
src/services/whatsapp.service.ts
```

Required functions:

```
sendTextMessage(phoneNumber, message)

sendTemplateMessage(phoneNumber, templateName, variables)
```

Responsibilities:

- Build API payload

- Attach authentication headers

- Send requests to WhatsApp API

- Handle API responses

- Handle errors

---

# 5. Webhook Integration

The backend must expose the following endpoint:

```
POST /webhook/whatsapp
```

Responsibilities:

1. Receive message events from 2Factor API

2. Parse incoming payload

3. Extract:

```
sender_phone_number
message_text
message_type
timestamp
```

1. Forward message to chatbot flow engine.

---

# 6. Chatbot Flow Engine

The system must implement a **flow engine** to process conversations.

Responsibilities:

- Understand user message

- Determine conversation state

- Execute business logic

- Send responses through WhatsApp service

Example conversation:

```
User → Hi

Bot →
Hello! I'm here to help you with land record services.

Available services:

1. 7/12 Form – ₹20
2. 8A Form – ₹20
3. Property Card – ₹25
4. Ferfar – ₹30
```

---

# 7. Error Handling

The system must properly handle:

- Invalid API keys

- Rate limiting

- Network failures

- Invalid phone numbers

- Message delivery errors

All errors must be **logged with structured logs**.

---

# 8. Security Guidelines

Security requirements:

- Never expose API keys in frontend code

- Store credentials only in environment variables

- Validate webhook requests

- Implement request rate limiting

- Log suspicious activity

---

# 9. Expected System Output

With this configuration the system should automatically generate:

- WhatsApp API client

- Webhook handler

- Message sending service

- Chatbot flow engine

- Template message support

- Backend integration with **2Factor eWhatsApp**

---
