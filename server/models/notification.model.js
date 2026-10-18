import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.model.js';
import { orders } from './orders.model.js';
import { products } from './products.model.js';
import { contactMessages } from './contact.model.js';

export const adminNotifications = pgTable(
  'admin_notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    type: varchar('type', { length: 32 }).notNull(),

    title: varchar('title', { length: 255 }).notNull(),

    message: text('message').notNull(),

    isRead: boolean('is_read').default(false).notNull(),

    orderId: uuid('order_id').references(() => orders.id, {
      onDelete: 'set null',
    }),

    reviewId: uuid('review_id'),

    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),

    contactMessageId: uuid('contact_message_id').references(() => contactMessages.id, {
      onDelete: 'set null',
    }),

    guestSessionId: uuid('guest_session_id'),

    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('idx_admin_notifications_unique_order')
      .on(table.orderId)
      .where(sql`${table.orderId} IS NOT NULL`),

    uniqueIndex('idx_admin_notifications_unique_review')
      .on(table.reviewId)
      .where(sql`${table.reviewId} IS NOT NULL`),

    uniqueIndex('idx_admin_notifications_unique_contact')
      .on(table.contactMessageId)
      .where(sql`${table.contactMessageId} IS NOT NULL`),

    index('idx_admin_notifications_is_read').on(table.isRead),

    index('idx_admin_notifications_created_at').on(table.createdAt),

    index('idx_admin_notifications_type').on(table.type),
  ]
);

export const adminNotificationsRelations = relations(
  adminNotifications,
  ({ one }) => ({
    user: one(users, {
      fields: [adminNotifications.userId],
      references: [users.id],
    }),
    order: one(orders, {
      fields: [adminNotifications.orderId],
      references: [orders.id],
    }),
    product: one(products, {
      fields: [adminNotifications.productId],
      references: [products.id],
    }),
    contactMessage: one(contactMessages, {
      fields: [adminNotifications.contactMessageId],
      references: [contactMessages.id],
    }),
  })
);
