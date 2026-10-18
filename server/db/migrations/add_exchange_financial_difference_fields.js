import { pool as defaultPool } from '../pool.js';

/**
 * Idempotent schema migration for exchange financial difference tracking fields:
 * - product_amount_added (NUMERIC 10, 3 DEFAULT 0)
 * - product_refund_obligation (NUMERIC 10, 3 DEFAULT 0)
 *
 * Safe to run multiple times without error.
 */
export async function runExchangeFinancialDifferenceFieldsMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE order_exchanges
      ADD COLUMN IF NOT EXISTS product_amount_added NUMERIC(10, 3) NOT NULL DEFAULT 0;
    `);

    await client.query(`
      ALTER TABLE order_exchanges
      ADD COLUMN IF NOT EXISTS product_refund_obligation NUMERIC(10, 3) NOT NULL DEFAULT 0;
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
