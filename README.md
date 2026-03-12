# Land Record Services Bot 🤖

A comprehensive WhatsApp Chatbot solution for retrieving Maharashtra Land Records (7/12, 8A, Ferfar, Property Card) directly via WhatsApp.

![WhatsApp Bot](https://img.shields.io/badge/WhatsApp-Bot-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-Backend-E36002?style=for-the-badge&logo=hono&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791?style=for-the-badge&logo=postgresql&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Runtime-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)

## 📌 Overview

This project provides a seamless interface for citizens to access land records. 
Users interact with a WhatsApp bot to:
1.  Select a service (7/12, 8A, Property Card, Ferfar).
2.  Navigate through location menus (District -> Taluka -> Village).
3.  Enter specific identifiers (Gat No, Survey No).
4.  Make secure payments via Razorpay.
5.  Receive the official PDF document directly in the chat.

## 🏗 Architecture

The system is built with a microservices-inspired architecture:

-   **Backend:** Node.js (Bun runtime) + Hono Framework
-   **Database:** PostgreSQL (with `postgres.js` for high performance)
-   **Messaging/Queue:** RabbitMQ (for offloading scraping tasks)
-   **WhatsApp Integration:** `whatsapp-web.js` (running via Puppeteer)
-   **Scrapers (Workers):** Python scripts (running independently, consuming RabbitMQ queues)
-   **Payment:** Razorpay Integration

## 🚀 Key Features

*   **Menu-Driven Interface:** Easy navigation for non-tech-savvy users.
*   **Automated Verification:** Checks record existence before payment.
*   **Secure Payments:** Integrated Razorpay checkout flow.
*   **Asynchronous Processing:** Heavy scraping tasks run in the background without blocking the bot.
*   **Admin Dashboard API:** Endpoints to monitor session status and bot health.

## 📂 Project Structure

```
├── src
│   ├── config          # Database, Payment, WhatsApp configurations
│   ├── controllers     # HTTP Route Handlers for each module
│   ├── services        # Business Logic (Session, Payments, Queueing)
│   ├── utils           # Helper functions (Logger)
│   └── index.ts        # Entry point
├── downloads           # Temporary storage for generated PDFs
├── logs                # Application logs
└── README.md           # This file
```

## 🛠 Prerequisites

-   **Node.js** (v18+) or **Bun**
-   **PostgreSQL** (v14+)
-   **RabbitMQ** (Running on default port 5672)
-   **Python 3.10+** (For workers)

## 🚦 Getting Started

Please refer to `SETUP.md` for detailed installation and usage instructions.

## 🤝 Contribution

Contributions are welcome! Please ensure you follow the existing code style and adding documentation for any new features.

---
**Note:** This project handles sensitive government data. Ensure compliance with all local regulations when deploying.
