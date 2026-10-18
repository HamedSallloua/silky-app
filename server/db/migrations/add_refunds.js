import { pool as defaultPool } from '../pool.js';

/**
 * Idempotent schema migration for order refunds and refunded status.
 * Safe to run multiple times without error.
 */
export async function runRefundsMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');

    // 1. Ensure 'refunded' value exists on order_status enum
    await client.query(`
      DO $$ BEGIN
        ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'refunded';
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 2. Ensure order_refunds table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_refunds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        refund_number VARCHAR(64) NOT NULL UNIQUE,
        payment_responsibility VARCHAR(32) NOT NULL DEFAULT 'customer_paid',
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255),
        customer_phone VARCHAR(32) NOT NULL,
        shipping_address TEXT NOT NULL,
        refund_amount NUMERIC(10, 3) NOT NULL CHECK (refund_amount >= 0),
        delivery_fee NUMERIC(10, 3) NOT NULL DEFAULT 8.000 CHECK (delivery_fee >= 0),
        carrier_cost NUMERIC(10, 3) NOT NULL DEFAULT 7.000 CHECK (carrier_cost >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2b. Ensure payment_responsibility column exists if table was created previously without it
    await client.query(`
      ALTER TABLE order_refunds
      ADD COLUMN IF NOT EXISTS payment_responsibility VARCHAR(32) NOT NULL DEFAULT 'customer_paid';
    `);

    // 3. Ensure refund_items table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS refund_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        refund_id UUID NOT NULL REFERENCES order_refunds(id) ON DELETE CASCADE,
        variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
        product_title VARCHAR(255) NOT NULL,
        variant_label VARCHAR(255),
        image_url TEXT,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(10, 3) NOT NULL CHECK (unit_price >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 4. Ensure indexes exist
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_order_refunds_order_id ON order_refunds(order_id);
      CREATE INDEX IF NOT EXISTS idx_refund_items_refund_id ON refund_items(refund_id);
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
