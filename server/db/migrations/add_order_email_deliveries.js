/**
 * Migration: add_order_email_deliveries
 *
 * Creates the order_email_deliveries table used for idempotent email dispatch.
 * The UNIQUE (order_id, email_type) constraint is the authoritative deduplication
 * lock — it prevents duplicate confirmation emails across server restarts,
 * multiple instances, and concurrent requests.
 *
 * Usage:  node server/db/migrations/add_order_email_deliveries.js
 */
import '../../config/env.js';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS order_email_deliveries (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        email_type      VARCHAR(64) NOT NULL,
        status          VARCHAR(16) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'sent', 'failed')),
        error_message   TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at         TIMESTAMPTZ,

        CONSTRAINT uq_order_email_deliveries_order_type
          UNIQUE (order_id, email_type)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_order_email_deliveries_order_id
        ON order_email_deliveries (order_id);
    `);

    await client.query('COMMIT');
    console.log('Migration complete: order_email_deliveries table created.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
