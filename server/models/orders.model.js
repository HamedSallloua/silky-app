import { pgTable, uuid, varchar, text, numeric, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.model.js';
import { productVariants } from './products.model.js';

export const orderStatusEnum = pgEnum('order_status', ['pending', 'processing', 'completed', 'cancelled', 'exchanged']);
export const orderSourceEnum = pgEnum('order_source', ['web', 'social_media', 'instagram', 'whatsapp', 'phone']);

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderNumber: varchar('order_number', { length: 32 }).notNull().unique(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  guestSessionId: uuid('guest_session_id'),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }),
  customerPhone: varchar('customer_phone', { length: 32 }).notNull(),
  shippingAddress: text('shipping_address').notNull(),
  subtotal: numeric('subtotal', { precision: 10, scale: 3 }).notNull(),
  deliveryFee: numeric('delivery_fee', { precision: 10, scale: 3 }).default('0').notNull(),
  totalAmount: numeric('total_amount', { precision: 10, scale: 3 }).notNull(),
  orderSource: orderSourceEnum('order_source').default('web').notNull(),
  status: orderStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  productTitle: varchar('product_title', { length: 255 }).notNull(),
  variantLabel: varchar('variant_label', { length: 255 }),
  imageUrl: text('image_url'),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price', { precision: 10, scale: 3 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orderExchanges = pgTable('order_exchanges', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  exchangeNumber: varchar('exchange_number', { length: 64 }).notNull().unique(),
  exchangeSequence: integer('exchange_sequence').default(1).notNull(),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }),
  customerPhone: varchar('customer_phone', { length: 32 }).notNull(),
  shippingAddress: text('shipping_address').notNull(),
  subtotal: numeric('subtotal', { precision: 10, scale: 3 }).notNull(),
  deliveryFee: numeric('delivery_fee', { precision: 10, scale: 3 }).default('0').notNull(),
  totalAmount: numeric('total_amount', { precision: 10, scale: 3 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const exchangeItems = pgTable('exchange_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  exchangeId: uuid('exchange_id').notNull().references(() => orderExchanges.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  productTitle: varchar('product_title', { length: 255 }).notNull(),
  variantLabel: varchar('variant_label', { length: 255 }),
  imageUrl: text('image_url'),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price', { precision: 10, scale: 3 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
  exchanges: many(orderExchanges),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
}));

export const orderExchangesRelations = relations(orderExchanges, ({ one, many }) => ({
  order: one(orders, {
    fields: [orderExchanges.orderId],
    references: [orders.id],
  }),
  items: many(exchangeItems),
}));

export const exchangeItemsRelations = relations(exchangeItems, ({ one }) => ({
  exchange: one(orderExchanges, {
    fields: [exchangeItems.exchangeId],
    references: [orderExchanges.id],
  }),
  variant: one(productVariants, {
    fields: [exchangeItems.variantId],
    references: [productVariants.id],
  }),
}));
