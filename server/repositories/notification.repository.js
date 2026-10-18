import { eq, desc, and, lt, sql } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { adminNotifications } from '../models/index.js';

function serializeNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    isRead: Boolean(row.isRead),
    orderId: row.orderId || null,
    reviewId: row.reviewId || null,
    productId: row.productId || null,
    contactMessageId: row.contactMessageId || null,
    guestSessionId: row.guestSessionId || null,
    userId: row.userId || null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : (row.createdAt ?? new Date().toISOString()),
  };
}

export const notificationRepository = {
  async createNotification({
    type,
    title,
    message,
    orderId = null,
    reviewId = null,
    productId = null,
    contactMessageId = null,
    guestSessionId = null,
    userId = null,
  }, tx = db) {
    const [row] = await tx
      .insert(adminNotifications)
      .values({
        type,
        title,
        message,
        orderId,
        reviewId,
        productId,
        contactMessageId,
        guestSessionId,
        userId,
        isRead: false,
      })
      .onConflictDoNothing()
      .returning();

    return row ? serializeNotification(row) : null;
  },

  async getLatest(limit = 5, tx = db) {
    const rows = await tx
      .select()
      .from(adminNotifications)
      .orderBy(desc(adminNotifications.createdAt))
      .limit(limit);

    return rows.map(serializeNotification);
  },

  async getAll({ offset = 0, limit = 20 } = {}, tx = db) {
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const [totalRes] = await tx
      .select({ count: sql`count(*)::int` })
      .from(adminNotifications);

    const rows = await tx
      .select()
      .from(adminNotifications)
      .orderBy(desc(adminNotifications.createdAt))
      .offset(safeOffset)
      .limit(safeLimit);

    return {
      notifications: rows.map(serializeNotification),
      total: totalRes?.count || 0,
      offset: safeOffset,
      limit: safeLimit,
    };
  },

  async getUnreadCount(tx = db) {
    const [res] = await tx
      .select({ count: sql`count(*)::int` })
      .from(adminNotifications)
      .where(eq(adminNotifications.isRead, false));

    return res?.count || 0;
  },

  async markOneRead(id, tx = db) {
    if (!id || typeof id !== 'string') return null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
    if (!isUuid) return null;

    const [updated] = await tx
      .update(adminNotifications)
      .set({ isRead: true })
      .where(eq(adminNotifications.id, id.trim()))
      .returning();

    return updated ? serializeNotification(updated) : null;
  },

  async markAllRead(tx = db) {
    await tx
      .update(adminNotifications)
      .set({ isRead: true })
      .where(eq(adminNotifications.isRead, false));

    return { success: true };
  },

  async cleanupOldRead(days = 90, tx = db) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await tx
      .delete(adminNotifications)
      .where(and(eq(adminNotifications.isRead, true), lt(adminNotifications.createdAt, cutoff)));
  },
};
