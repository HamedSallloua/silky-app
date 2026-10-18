import { pool as defaultPool } from '../pool.js';

/**
 * Idempotent schema migration for reviews table.
 * Adds guest_session_id and email columns for guest identity snapshot.
 * Safe to run multiple times without error.
 */
export async function runReviewIdentityFieldsMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');

    // 1. Add guest_session_id and email columns if not exist
    await client.query(`
      ALTER TABLE reviews
      ADD COLUMN IF NOT EXISTS guest_session_id UUID,
      ADD COLUMN IF NOT EXISTS email VARCHAR(255);
    `);

    // 2. Create partial index on guest_session_id for lookup performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_guest_session_id
        ON reviews (guest_session_id)
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
