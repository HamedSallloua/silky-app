import { pool as defaultPool } from '../pool.js';

/**
  * Idempotent schema migration for idempotency_keys table.
  * Safe to run multiple times without error.
  */
export async function runIdempotencyKeysMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');

    // 1. Ensure idempotency_keys table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key VARCHAR(255) NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        guest_session_id UUID,
        request_path VARCHAR(255) NOT NULL,
        request_fingerprint VARCHAR(64) NOT NULL,
        order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
        response_status INTEGER NOT NULL DEFAULT 201,
        status VARCHAR(32) NOT NULL DEFAULT 'in_progress',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Ensure constraints exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'idempotency_shopper_exclusivity'
        ) THEN
          ALTER TABLE idempotency_keys
          ADD CONSTRAINT idempotency_shopper_exclusivity
          CHECK ((user_id IS NOT NULL AND guest_session_id IS NULL) OR (user_id IS NULL AND guest_session_id IS NOT NULL));
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'idempotency_status_valid'
        ) THEN
          ALTER TABLE idempotency_keys
          ADD CONSTRAINT idempotency_status_valid
          CHECK (status IN ('in_progress', 'completed'));
        END IF;
      END $$;
    `);

    // 3. Ensure unique and performance indexes exist
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_user_key
        ON idempotency_keys (user_id, key)
        WHERE user_id IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_guest_key
        ON idempotency_keys (guest_session_id, key)
        WHERE guest_session_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_idempotency_created_at
        ON idempotency_keys (created_at);
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
