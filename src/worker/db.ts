import postgres from 'postgres';
import 'dotenv/config';

const sql = postgres({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'landrecords',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'admin123',
  onnotice: () => {},
  connect_timeout: 30
});

async function initDB() {
  try {
    console.log("⏳ Connecting to Database...");
    
    // Property Card Table
    await sql`
      CREATE TABLE IF NOT EXISTS requests_property_card (
        id SERIAL PRIMARY KEY,
        region TEXT,
        district TEXT,
        office TEXT,
        village TEXT,
        cts_no TEXT,
        whatsapp_phone TEXT,
        status TEXT DEFAULT 'pending_payment',
        pdf_url TEXT,
        payment_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        doc_type TEXT DEFAULT 'PROPERTY_CARD'
      )
    `;
    console.log("✅ Table requests_property_card created!");

    // Ferfar Table
    await sql`
      CREATE TABLE IF NOT EXISTS requests_ferfar (
        id SERIAL PRIMARY KEY,
        district TEXT,
        taluka TEXT,
        village TEXT,
        mutation_no TEXT,
        whatsapp_phone TEXT,
        status TEXT DEFAULT 'pending_payment',
        pdf_url TEXT,
        payment_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        doc_type TEXT DEFAULT 'FERFAR'
      )
    `;
    console.log("✅ Table requests_ferfar created!");

    // 7-12 Satbara Table
    await sql`
      CREATE TABLE IF NOT EXISTS requests_7_12 (
        id SERIAL PRIMARY KEY,
        district TEXT,
        taluka TEXT,
        village TEXT,
        gat_no TEXT,
        sheet_no TEXT,
        whatsapp_phone TEXT,
        status TEXT DEFAULT 'pending_payment',
        pdf_url TEXT,
        payment_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        doc_type TEXT DEFAULT 'SATBARA_7_12'
      )
    `;
    console.log("✅ Table requests_7_12 created!");

    // 8A Table
    await sql`
      CREATE TABLE IF NOT EXISTS requests_8a (
        id SERIAL PRIMARY KEY,
        district TEXT,
        taluka TEXT,
        village TEXT,
        gat_no TEXT,
        whatsapp_phone TEXT,
        status TEXT DEFAULT 'pending_payment',
        pdf_url TEXT,
        payment_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        doc_type TEXT DEFAULT 'SATBARA_8A'
      )
    `;
    console.log("✅ Table requests_8a created!");

    console.log("✅ All PostgreSQL Tables Ready!");
  } catch (err: any) {
    console.error("❌ Database connection failed:", err.message);
  }
}

initDB();

export default sql;