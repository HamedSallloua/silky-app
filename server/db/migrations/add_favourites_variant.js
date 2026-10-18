import { pool as defaultPool } from '../pool.js';

/**
 * Idempotent schema migration for variant_id in favourites table.
 * Supports variant-aware favorites (user_id, variant_id) while preserving
 * legacy product-only favorites (variant_id IS NULL).
 * Safe to run multiple times without error.
 */
export async function runFavouritesVariantMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');

    // 1. Add variant_id column if not exists
    await client.query(`
      ALTER TABLE favourites
      ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE;
    `);

    // 2. Drop old product-only unique indexes if they exist
    await client.query(`
      DROP INDEX IF EXISTS idx_favourites_user_product;
      DROP INDEX IF EXISTS idx_favourites_guest_product;
    `);

    // 3. Create partial unique indexes for variant-aware favorites
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_favourites_user_variant
        ON favourites (user_id, variant_id)
        WHERE user_id IS NOT NULL AND variant_id IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_favourites_guest_variant
        ON favourites (guest_session_id, variant_id)
        WHERE guest_session_id IS NOT NULL AND variant_id IS NOT NULL;
    `);

    // 4. Create partial unique indexes for legacy product-only favorites (variant_id IS NULL)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_favourites_user_product_null_variant
        ON favourites (user_id, product_id)
        WHERE user_id IS NOT NULL AND variant_id IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_favourites_guest_product_null_variant
        ON favourites (guest_session_id, product_id)
        WHERE guest_session_id IS NOT NULL AND variant_id IS NULL;
    `);

    // 5. Create index on variant_id for join/lookup performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_favourites_variant_id
        ON favourites (variant_id);
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
