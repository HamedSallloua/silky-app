import { pool as defaultPool } from '../pool.js';

/**
 * Idempotent schema migration for hero_config column in site_settings.
 * Safe to run multiple times without error.
 */
export async function runHeroConfigMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE site_settings
      ADD COLUMN IF NOT EXISTS hero_config TEXT;
    `);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
