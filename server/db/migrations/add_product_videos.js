import { pool as defaultPool } from '../pool.js';

/**
 * Idempotent schema migration for product_videos table.
 * Safe to run multiple times without error.
 */
export async function runProductVideosMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');

    // 1. Ensure product_videos table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_videos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        video_url TEXT NOT NULL,
        sort_order SMALLINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Ensure indexes exist for product video lookups and ordering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_product_videos_product_id
        ON product_videos (product_id);

      CREATE INDEX IF NOT EXISTS idx_product_videos_sort_order
        ON product_videos (product_id, sort_order ASC, created_at ASC);
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
