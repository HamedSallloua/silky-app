import { pool as defaultPool } from '../pool.js';

/**
 * Idempotent schema migration for users table.
 * Enforces database-level CHECK constraint: email IS NOT NULL OR phone_number IS NOT NULL.
 * Inspects for violations before applying.
 * Safe to run multiple times without error.
 */
export async function runUsersIdentityCheckMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');

    // 1. Inspect for existing violations
    const violations = await client.query(`
      SELECT id, email, phone_number
      FROM users
      WHERE email IS NULL AND phone_number IS NULL;
    `);

    if (violations.rows.length > 0) {
      throw new Error(
        `Cannot apply constraint users_email_or_phone_required: found ${violations.rows.length} user(s) with both email and phone_number NULL.`
      );
    }

    // 2. Add CHECK constraint if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'users_email_or_phone_required'
        ) THEN
          ALTER TABLE users
            ADD CONSTRAINT users_email_or_phone_required
            CHECK (email IS NOT NULL OR phone_number IS NOT NULL);
        END IF;
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
