import '../../config/env.js';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function runExchangesMigration(clientOrPool = pool) {
  await clientOrPool.query("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'exchanged'");

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS order_exchanges (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      exchange_number   VARCHAR(64) NOT NULL UNIQUE,
      exchange_sequence INTEGER NOT NULL DEFAULT 1,
      customer_name     VARCHAR(255) NOT NULL,
      customer_email    VARCHAR(255),
      customer_phone    VARCHAR(32) NOT NULL,
      shipping_address  TEXT NOT NULL,
      subtotal          NUMERIC(10, 3) NOT NULL CHECK (subtotal >= 0),
      delivery_fee      NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
      total_amount      NUMERIC(10, 3) NOT NULL CHECK (total_amount >= 0),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Add exchange_sequence column if it was omitted in an earlier migration run
  await clientOrPool.query(`
    ALTER TABLE order_exchanges
      ADD COLUMN IF NOT EXISTS exchange_sequence INTEGER NOT NULL DEFAULT 1;
  `);

  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS idx_order_exchanges_order_id ON order_exchanges (order_id);
  `);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS exchange_items (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exchange_id    UUID NOT NULL REFERENCES order_exchanges(id) ON DELETE CASCADE,
      variant_id     UUID REFERENCES product_variants(id) ON DELETE SET NULL,
      product_title  VARCHAR(255) NOT NULL,
      variant_label  VARCHAR(255),
      image_url      TEXT,
      quantity       INTEGER NOT NULL CHECK (quantity > 0),
      unit_price     NUMERIC(10, 3) NOT NULL CHECK (unit_price >= 0),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS idx_exchange_items_exchange_id ON exchange_items (exchange_id);
    CREATE INDEX IF NOT EXISTS idx_exchange_items_variant_id ON exchange_items (variant_id);
  `);
}

if (process.argv[1] && process.argv[1].endsWith('add_exchanges.js')) {
  runExchangesMigration()
    .then(() => {
      console.log('Successfully applied exchanges schema migration!');
    })
    .catch((err) => {
      console.error('Exchanges migration error:', err.message);
    })
    .finally(() => {
      pool.end();
    });
}
