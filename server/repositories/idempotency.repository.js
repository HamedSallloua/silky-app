import { eq, and, sql, lt } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { idempotencyKeys } from '../models/index.js';

export const idempotencyRepository = {
  /**
   * Find an existing idempotency record by shopper identity and key.
   */
  async findByShopperAndKey({ key, userId = null, guestSessionId = null }, tx = db) {
    if (!key || (!userId && !guestSessionId)) return null;

    const condition = userId
      ? and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key))
      : and(eq(idempotencyKeys.guestSessionId, guestSessionId), eq(idempotencyKeys.key, key));

    const [record] = await tx
      .select()
      .from(idempotencyKeys)
      .where(condition);

    return record || null;
  },

  /**
   * Reserve an idempotency key with 'in_progress' status within a transaction.
   * PostgreSQL unique index guarantees atomic reservation or unique violation (23505).
   */
  async reserveKey({ key, userId = null, guestSessionId = null, requestPath, requestFingerprint }, tx = db) {
    const [record] = await tx
      .insert(idempotencyKeys)
      .values({
        key,
        userId: userId || null,
        guestSessionId: guestSessionId || null,
        requestPath,
        requestFingerprint,
        status: 'in_progress',
        responseStatus: 201,
      })
      .returning();

    return record;
  },

  /**
   * Mark the reserved idempotency record as 'completed' and link the created order ID.
   */
  async completeKey(id, { orderId, responseStatus = 201 }, tx = db) {
    const [updated] = await tx
      .update(idempotencyKeys)
      .set({
        orderId,
        responseStatus,
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(idempotencyKeys.id, id))
      .returning();

    return updated || null;
  },

  /**
   * Delete an idempotency record (e.g. if explicit rollback is needed outside a tx).
   */
  async deleteKey(id, tx = db) {
    if (!id) return;
    await tx.delete(idempotencyKeys).where(eq(idempotencyKeys.id, id));
  },

  /**
   * Safe cleanup of completed idempotency records older than retention window.
   * In-progress records are NEVER deleted.
   */
  async cleanupExpired(retentionHours = 48, tx = db) {
    const safeHours = Math.max(1, Number(retentionHours) || 48);
    const result = await tx.execute(sql`
      DELETE FROM idempotency_keys
      WHERE status = 'completed'
        AND created_at < NOW() - (${safeHours} || ' hours')::interval
    `);
    return result?.rowCount || 0;
  },
};
