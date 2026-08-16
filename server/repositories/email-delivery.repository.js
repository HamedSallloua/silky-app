import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { orderEmailDeliveries } from '../models/index.js';

export const emailDeliveryRepository = {
  /**
   * Attempt to claim the email-dispatch slot for a given order + email type.
   *
   * Uses INSERT ... ON CONFLICT DO NOTHING as the authoritative deduplication
   * mechanism. Only one process (across restarts, instances, concurrent calls)
   * can successfully insert the row for a given (order_id, email_type) pair.
   *
   * @param {string} orderId
   * @param {string} emailType  e.g. 'order_confirmation'
   * @param {object} [tx]       Optional Drizzle transaction context.
   * @returns {object|null}     The inserted row if claimed, null if already claimed.
   */
  async claimDelivery(orderId, emailType, tx = db) {
    const rows = await tx
      .insert(orderEmailDeliveries)
      .values({ orderId, emailType, status: 'pending' })
      .onConflictDoNothing()
      .returning();

    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Mark a delivery record as successfully sent.
   *
   * @param {string} deliveryId  The UUID of the order_email_deliveries row.
   * @param {object} [tx]
   */
  async markSent(deliveryId, tx = db) {
    await tx
      .update(orderEmailDeliveries)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(orderEmailDeliveries.id, deliveryId));
  },

  /**
   * Mark a delivery record as failed.
   *
   * The failed row can be deleted by an admin/script to allow a safe retry.
   *
   * @param {string} deliveryId
   * @param {string} errorMessage
   * @param {object} [tx]
   */
  async markFailed(deliveryId, errorMessage, tx = db) {
    await tx
      .update(orderEmailDeliveries)
      .set({ status: 'failed', errorMessage: String(errorMessage).slice(0, 4000) })
      .where(eq(orderEmailDeliveries.id, deliveryId));
  },

  /**
   * Retrieve the delivery record for a specific order + email type.
   * Used by tests and admin tooling.
   *
   * @param {string} orderId
   * @param {string} emailType
   * @param {object} [tx]
   * @returns {object|null}
   */
  async findByOrderAndType(orderId, emailType, tx = db) {
    const [row] = await tx
      .select()
      .from(orderEmailDeliveries)
      .where(
        and(
          eq(orderEmailDeliveries.orderId, orderId),
          eq(orderEmailDeliveries.emailType, emailType)
        )
      );
    return row || null;
  },

  /**
   * Delete the delivery record for a specific order + email type.
   * Enables safe manual retry after a failure.
   *
   * @param {string} orderId
   * @param {string} emailType
   * @param {object} [tx]
   */
  async deleteByOrderAndType(orderId, emailType, tx = db) {
    await tx
      .delete(orderEmailDeliveries)
      .where(
        and(
          eq(orderEmailDeliveries.orderId, orderId),
          eq(orderEmailDeliveries.emailType, emailType)
        )
      );
  },
};
