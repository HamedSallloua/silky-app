import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
        first_name VARCHAR(255) NOT NULL,
        last_name  VARCHAR(255) NOT NULL,
        email      VARCHAR(255) NOT NULL,
        message    TEXT NOT NULL,
        status     VARCHAR(32) NOT NULL DEFAULT 'pending',
        replied_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages (created_at DESC);
      ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'pending';
      ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
    `);
    console.log('Migration complete: contact_messages table ready with status and replied_at columns.');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
