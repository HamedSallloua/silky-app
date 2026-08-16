import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { contactMessages } from '../models/index.js';

function serializeMessage(row) {
  return {
    id: row.id,
    userId: row.userId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    message: row.message,
    status: row.status || 'pending',
    repliedAt: row.repliedAt instanceof Date ? row.repliedAt.toISOString() : (row.repliedAt ?? null),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : (row.createdAt ?? new Date().toISOString()),
  };
}

export const contactRepository = {
  async createMessage({ userId = null, firstName, lastName, email, message }, tx = db) {
    const [row] = await tx.insert(contactMessages).values({
      userId,
      firstName,
      lastName,
      email,
      message,
    }).returning();
    return row ? serializeMessage(row) : null;
  },

  async getAllMessages(tx = db) {
    const rows = await tx.select().from(contactMessages).orderBy(desc(contactMessages.createdAt));
    return rows.map(serializeMessage);
  },

  async getMessageById(id, tx = db) {
    if (!id || typeof id !== 'string') return null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
    if (!isUuid) return null;
    const [row] = await tx.select().from(contactMessages).where(eq(contactMessages.id, id.trim()));
    return row ? serializeMessage(row) : null;
  },

  /**
   * Conditionally marks a contact message as resolved.
   * Only updates the row when status = 'pending', preserving the original repliedAt
   * for already-resolved messages.
   */
  async markAsResolved(id, tx = db) {
    if (!id || typeof id !== 'string') return null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
    if (!isUuid) return null;

    const [updated] = await tx
      .update(contactMessages)
      .set({ status: 'resolved', repliedAt: new Date() })
      .where(and(eq(contactMessages.id, id.trim()), eq(contactMessages.status, 'pending')))
      .returning();

    if (updated) {
      return serializeMessage(updated);
    }

    // Already resolved — return current row without modification
    const [current] = await tx.select().from(contactMessages).where(eq(contactMessages.id, id.trim()));
    return current ? serializeMessage(current) : null;
  },
};
