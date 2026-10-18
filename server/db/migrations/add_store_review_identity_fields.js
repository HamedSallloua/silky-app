import { pool as defaultPool } from '../pool.js';

/**
 * Idempotent schema migration for store_reviews table.
 * Adds user_id (FK to users ON DELETE SET NULL) and guest_session_id columns.
 * Preserves existing email NOT NULL DEFAULT '' column and rating/status checks.
 * Safe to run multiple times without error.
 */
export async function runStoreReviewIdentityFieldsMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');

    // 1. Add user_id and guest_session_id columns if not exist
    await client.query(`
      ALTER TABLE store_reviews
      ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS guest_session_id UUID;
    `);

    // 2. Create partial indexes for query performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_store_reviews_user_id
        ON store_reviews (user_id)
        WHERE user_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_store_reviews_guest_session_id
        ON store_reviews (guest_session_id)
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
