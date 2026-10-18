import { pool as defaultPool } from '../pool.js';

/**
 * Idempotent schema migration for exchanges and payment_responsibility.
 * Safe to run multiple times without error.
 */
export async function runExchangesMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');

    // 1. Ensure order_exchanges table exists (already exists from 0000_secret_wonder_man.sql)
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_exchanges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        exchange_number VARCHAR(64) NOT NULL UNIQUE,
        exchange_sequence INTEGER NOT NULL DEFAULT 1,
        payment_responsibility VARCHAR(32) NOT NULL DEFAULT 'customer_paid',
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255),
        customer_phone VARCHAR(32) NOT NULL,
        shipping_address TEXT NOT NULL,
        subtotal NUMERIC(10, 3) NOT NULL CHECK (subtotal >= 0),
        delivery_fee NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
        total_amount NUMERIC(10, 3) NOT NULL CHECK (total_amount >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Ensure payment_responsibility column exists if table was created previously without it
    await client.query(`
      ALTER TABLE order_exchanges
      ADD COLUMN IF NOT EXISTS payment_responsibility VARCHAR(32) NOT NULL DEFAULT 'customer_paid';
    `);

    // 3. Ensure exchange_items table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS exchange_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        exchange_id UUID NOT NULL REFERENCES order_exchanges(id) ON DELETE CASCADE,
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
      CREATE INDEX IF NOT EXISTS idx_order_exchanges_order_id ON order_exchanges(order_id);
      CREATE INDEX IF NOT EXISTS idx_exchange_items_exchange_id ON exchange_items(exchange_id);
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
