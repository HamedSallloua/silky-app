import { pool as defaultPool } from '../pool.js';

/**
 * Migration to remove order_source column from orders and drafts tables,
 * and drop the order_source enum type.
 * Completely idempotent and safe to run multiple times.
 */
export async function runRemoveOrderSourceMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');

    // Drop indexes if exist
    await client.query(`
      DROP INDEX IF EXISTS idx_orders_order_source;
    `);

    // Drop order_source column from orders table
    await client.query(`
      ALTER TABLE orders
      DROP COLUMN IF EXISTS order_source CASCADE;
    `);

    // Drop order_source column from drafts table if present
    await client.query(`
      ALTER TABLE drafts
      DROP COLUMN IF EXISTS order_source CASCADE;
    `);

    // Drop order_source enum type
    await client.query(`
      DROP TYPE IF EXISTS order_source CASCADE;
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
