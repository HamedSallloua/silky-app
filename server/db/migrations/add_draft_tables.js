import { pool as defaultPool } from '../pool.js';

/**
 * Idempotent schema migration for drafts and draft_items tables.
 * Safe to run multiple times without error.
 */
export async function runDraftTablesMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');

    // 1. Ensure drafts table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS drafts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_name VARCHAR(255),
        phone_number VARCHAR(32),
        customer_email VARCHAR(255),
        governorate VARCHAR(100),
        shipping_address TEXT,
        delivery_fee NUMERIC(10, 3),
        notes TEXT,
        converted_at TIMESTAMPTZ,
        converted_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Ensure draft_items table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS draft_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
        variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
        product_title VARCHAR(255),
        variant_label VARCHAR(255),
        image_url TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price NUMERIC(10, 3),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 3. Ensure draft_conversions journal table exists for State D cross-transaction recovery
    await client.query(`
      CREATE TABLE IF NOT EXISTS draft_conversions (
        draft_id UUID PRIMARY KEY,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 3. Ensure performance and lookup indexes exist
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_drafts_converted_at
        ON drafts (converted_at);

      CREATE INDEX IF NOT EXISTS idx_drafts_updated_at
        ON drafts (updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_drafts_converted_order_id
        ON drafts (converted_order_id)
        WHERE converted_order_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_draft_items_draft_id
        ON draft_items (draft_id);

      CREATE INDEX IF NOT EXISTS idx_draft_items_variant_id
        ON draft_items (variant_id);
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
