import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  try {
    await pool.query("ALTER TYPE order_source ADD VALUE IF NOT EXISTS 'social_media'");
    console.log("Successfully added 'social_media' to PostgreSQL order_source enum!");
  } catch (err) {
    console.error("Migration error:", err.message);
  } finally {
    await pool.end();
  }
}

run();
