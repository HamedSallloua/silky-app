import { pool as defaultPool } from '../pool.js';

/**
 * Idempotent schema migration for contact_messages table.
 * Adds guest_session_id column for guest message attribution.
 * Safe to run multiple times without error.
 */
export async function runContactMessageGuestSessionMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');

    // 1. Add guest_session_id column if not exists
    await client.query(`
      ALTER TABLE contact_messages
      ADD COLUMN IF NOT EXISTS guest_session_id UUID;
    `);

    // 2. Create partial index for lookup performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_contact_messages_guest_session_id
        ON contact_messages (guest_session_id)
        WHERE guest_session_id IS NOT NULL;
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
