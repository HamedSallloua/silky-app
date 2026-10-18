import { pool as defaultPool } from '../pool.js';

/**
 * Idempotent schema migration for 'delivered' status on order_status enum.
 * Safe to run multiple times without error.
 * NOTE: Prepared migration. Do not execute directly against protected database.
 */
export async function runDeliveredStatusMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');

    // Ensure 'delivered' value exists on order_status enum
    await client.query(`
      DO $$ BEGIN
        ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'delivered';
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
