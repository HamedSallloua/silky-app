import { pool as defaultPool } from '../pool.js';

/**
 * Idempotent schema migration for admin_notifications table.
 * Safe to run multiple times without error.
 */
export async function runNotificationsMigration(poolInstance = defaultPool) {
  const client = await poolInstance.connect();
  try {
    await client.query('BEGIN');

    // 1. Ensure admin_notifications table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(32) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT false,
        order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
        review_id UUID,
        product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        contact_message_id UUID REFERENCES contact_messages(id) ON DELETE SET NULL,
        guest_session_id UUID,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Ensure deduplication unique indexes exist
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_notifications_unique_order
        ON admin_notifications (order_id)
        WHERE order_id IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_notifications_unique_review
        ON admin_notifications (review_id)
        WHERE review_id IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_notifications_unique_contact
        ON admin_notifications (contact_message_id)
        WHERE contact_message_id IS NOT NULL;
    `);

    // 3. Ensure query performance indexes exist
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_notifications_is_read
        ON admin_notifications (is_read);

      CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at
        ON admin_notifications (created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_admin_notifications_type
        ON admin_notifications (type);
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
