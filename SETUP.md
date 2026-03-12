# ⚙️ Setup Instructions

Follow this guide to get the Land Record Services Bot running on your local machine or server.

---

## 🏗 Prerequisites

Before starting, ensure you have the following installed:

1.  **Node.js** (v18+) or **Bun** (Recommended).
2.  **PostgreSQL** (v14+).
3.  **RabbitMQ** (Standard installation).
4.  **Python 3.10+** (For worker scripts).
5.  **Git**.

---

## 📦 Installation

### 1. Clone the Repository
```bash
git clone https://github.com/pureframe-labs/service-bot.git
cd service-bot
```

### 2. Install Dependencies (Backend)
Using **Bun** (Preferred):
```bash
bun install
```
Or using **npm**:
```bash
npm install
```

### 3. Install Python Dependencies (Workers)
```bash
pip install -r requirements.txt
```
*(Ensure `playwright` dependencies are installed: `playwright install`)*

---

## 🔧 Configuration (.env)

Create a `.env` file in the root directory with the following variables:

```env
# SERVER
PORT=3000
BASE_URL=http://localhost:3000

# DATABASE (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=land_records_db

# RABBITMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# RAZORPAY (Payments)
RZP_ID=rzp_test_YourKeyId
RZP_SECRET=YourKeySecret

# WHATSAPP (Optional session path)
# WHATSAPP_SESSION_PATH=./whatsapp-session
```

---

## 🗄 Database Setup

The application automatically creates required tables on startup (`initializeDatabase` function in `src/config/database.config.ts`).

However, ensure the database `land_records_db` exists in PostgreSQL:
```sql
CREATE DATABASE land_records_db;
```

---

## 🚀 Running the Project

### 1. Start RabbitMQ
Ensure RabbitMQ service is running. On Windows:
```powershell
net start RabbitMQ
```
On Linux:
```bash
sudo service rabbitmq-server start
```

### 2. Start the Backend Server
```bash
bun run dev
# or
npm run dev
```
*The server will start on port 3000. It will automatically check DB connection and create queues.*

### 3. Authenticate WhatsApp
On start, the console will display a **QR Code**. Scan this with your WhatsApp Mobile App (Linked Devices) to authorize the bot.

### 4. Start the Worker (Separate Terminal)
The Python worker processes the queued scraping tasks.
```bash
python worker.py
```

---

## ✅ Usage

1.  Send a message (e.g., "Hi") to the bot's WhatsApp number.
2.  Follow the menu prompts to select a service (7/12, 8A, etc.).
3.  Enter the required details (District, Taluka, Village).
4.  Upon verification, proceed to payment.
5.  After successful payment, the bot will send the PDF document.

---

## ⚠️ Troubleshooting

-   **WhatsApp disconnects frequently:** Ensure stable internet connection and try restarting with `bun run dev`. Delete `.wwebjs_auth` or `whatsapp-session` folder to re-scan QR.
-   **Database Errors:** Verify credentials in `.env` and ensure PostgreSQL service is running.
-   **RabbitMQ Errors:** Ensure Erlang and RabbitMQ are installed and the service is active.
-   **Worker Errors:** Check Python logs for missing dependencies or Playwright browser issues.

---
**Maintained by Pureframe Labs**
