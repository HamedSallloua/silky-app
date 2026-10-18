import { pool as defaultPool } from '../pool.js';

/**
 * Idempotent schema migration for announcements column in site_settings.
 * Safe to run multiple times without error.
 */
export async function runAnnouncementsMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE site_settings
      ADD COLUMN IF NOT EXISTS announcements TEXT,
      ADD COLUMN IF NOT EXISTS announcements_hidden BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
