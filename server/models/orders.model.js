import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  timestamp,
  pgEnum,
  unique,
  index,
  check,
} from 'drizzle-orm/pg-core';

import { relations, sql } from 'drizzle-orm';

import { users } from './users.model.js';
import { productVariants } from './products.model.js';

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

export const orderStatusEnum = pgEnum(
  'order_status',
  [
    'pending',
    'processing',
    'completed',
    'cancelled',
    'exchanged',
  ]
);

export const orderSourceEnum = pgEnum(
  'order_source',
  [
    'web',
    'social_media',
    'instagram',
    'whatsapp',
    'phone',
  ]
);

export const emailDeliveryStatusEnum = pgEnum(
  'email_delivery_status',
  [
    'pending',
    'sent',
    'failed',
  ]
);

// -----------------------------------------------------------------------------
// Orders
// -----------------------------------------------------------------------------

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    orderNumber: varchar('order_number', {
      length: 32,
    }).notNull().unique(),

    userId: uuid('user_id')
      .references(() => users.id, {
        onDelete: 'set null',
      }),

    guestSessionId: uuid('guest_session_id'),

    customerName: varchar('customer_name', {
      length: 255,
    }).notNull(),

    customerEmail: varchar('customer_email', {
      length: 255,
    }),

    customerPhone: varchar('customer_phone', {
      length: 32,
    }).notNull(),

    shippingAddress: text('shipping_address')
      .notNull(),

    subtotal: numeric('subtotal', {
      precision: 10,
      scale: 3,
    }).notNull(),

    deliveryFee: numeric('delivery_fee', {
      precision: 10,
      scale: 3,
    }).default('0').notNull(),

    totalAmount: numeric('total_amount', {
      precision: 10,
      scale: 3,
    }).notNull(),

    orderSource: orderSourceEnum('order_source')
      .default('web')
      .notNull(),

    status: orderStatusEnum('status')
      .default('pending')
      .notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_orders_user_id').on(
      table.userId
    ),

    index('idx_orders_guest_session_id')
      .on(table.guestSessionId)
      .where(sql`${table.guestSessionId} IS NOT NULL`),

    index('idx_orders_order_source').on(
      table.orderSource
    ),

    index('idx_orders_status').on(
      table.status
    ),

    index('idx_orders_created_at').on(
      table.createdAt
    ),

    check(
      'orders_subtotal_non_negative',
      sql`${table.subtotal} >= 0`
    ),

    check(
      'orders_delivery_fee_non_negative',
      sql`${table.deliveryFee} >= 0`
    ),

    check(
      'orders_total_amount_non_negative',
      sql`${table.totalAmount} >= 0`
    ),
  ]
);

// -----------------------------------------------------------------------------
// Order items
// -----------------------------------------------------------------------------

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, {
        onDelete: 'cascade',
      }),

    variantId: uuid('variant_id')
      .references(() => productVariants.id, {
        onDelete: 'set null',
      }),

    productTitle: varchar('product_title', {
      length: 255,
    }).notNull(),

    variantLabel: varchar('variant_label', {
      length: 255,
    }),

    imageUrl: text('image_url'),

    quantity: integer('quantity').notNull(),

    unitPrice: numeric('unit_price', {
      precision: 10,
      scale: 3,
    }).notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_order_items_order_id').on(
      table.orderId
    ),

    index('idx_order_items_variant_id').on(
      table.variantId
    ),

    check(
      'order_items_quantity_positive',
      sql`${table.quantity} > 0`
    ),

    check(
      'order_items_unit_price_non_negative',
      sql`${table.unitPrice} >= 0`
    ),
  ]
);

// -----------------------------------------------------------------------------
// Order exchanges
// -----------------------------------------------------------------------------

export const orderExchanges = pgTable(
  'order_exchanges',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, {
        onDelete: 'cascade',
      }),

    exchangeNumber: varchar('exchange_number', {
      length: 64,
    }).notNull().unique(),

    exchangeSequence: integer('exchange_sequence')
      .default(1)
      .notNull(),

    customerName: varchar('customer_name', {
      length: 255,
    }).notNull(),

    customerEmail: varchar('customer_email', {
      length: 255,
    }),

    customerPhone: varchar('customer_phone', {
      length: 32,
    }).notNull(),

    shippingAddress: text('shipping_address')
      .notNull(),

    subtotal: numeric('subtotal', {
      precision: 10,
      scale: 3,
    }).notNull(),

    deliveryFee: numeric('delivery_fee', {
      precision: 10,
      scale: 3,
    }).default('0').notNull(),

    totalAmount: numeric('total_amount', {
      precision: 10,
      scale: 3,
    }).notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_order_exchanges_order_id').on(
      table.orderId
    ),

    check(
      'order_exchanges_subtotal_non_negative',
      sql`${table.subtotal} >= 0`
    ),

    check(
      'order_exchanges_delivery_fee_non_negative',
      sql`${table.deliveryFee} >= 0`
    ),

    check(
      'order_exchanges_total_amount_non_negative',
      sql`${table.totalAmount} >= 0`
    ),
  ]
);

// -----------------------------------------------------------------------------
// Exchange items
// -----------------------------------------------------------------------------

export const exchangeItems = pgTable(
  'exchange_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    exchangeId: uuid('exchange_id')
      .notNull()
      .references(() => orderExchanges.id, {
        onDelete: 'cascade',
      }),

    variantId: uuid('variant_id')
      .references(() => productVariants.id, {
        onDelete: 'set null',
      }),

    productTitle: varchar('product_title', {
      length: 255,
    }).notNull(),

    variantLabel: varchar('variant_label', {
      length: 255,
    }),

    imageUrl: text('image_url'),

    quantity: integer('quantity').notNull(),

    unitPrice: numeric('unit_price', {
      precision: 10,
      scale: 3,
    }).notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_exchange_items_exchange_id').on(
      table.exchangeId
    ),

    index('idx_exchange_items_variant_id').on(
      table.variantId
    ),

    check(
      'exchange_items_quantity_positive',
      sql`${table.quantity} > 0`
    ),

    check(
      'exchange_items_unit_price_non_negative',
      sql`${table.unitPrice} >= 0`
    ),
  ]
);

// -----------------------------------------------------------------------------
// Order email deliveries
// -----------------------------------------------------------------------------

export const orderEmailDeliveries = pgTable(
  'order_email_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, {
        onDelete: 'cascade',
      }),

    emailType: varchar('email_type', {
      length: 64,
    }).notNull(),

    status: emailDeliveryStatusEnum('status')
      .default('pending')
      .notNull(),

    errorMessage: text('error_message'),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).defaultNow().notNull(),

    sentAt: timestamp('sent_at', {
      withTimezone: true,
    }),
  },
  (table) => [
    unique(
      'uq_order_email_deliveries_order_type'
    ).on(
      table.orderId,
      table.emailType
    ),

    index(
      'idx_order_email_deliveries_order_id'
    ).on(table.orderId),
  ]
);

// -----------------------------------------------------------------------------
// Relations
// -----------------------------------------------------------------------------

export const ordersRelations = relations(
  orders,
  ({ one, many }) => ({
    user: one(users, {
      fields: [orders.userId],
      references: [users.id],
    }),

    items: many(orderItems),

    exchanges: many(orderExchanges),

    emailDeliveries: many(
      orderEmailDeliveries
    ),
  })
);

export const orderEmailDeliveriesRelations =
  relations(
    orderEmailDeliveries,
    ({ one }) => ({
      order: one(orders, {
        fields: [
          orderEmailDeliveries.orderId,
        ],
        references: [orders.id],
      }),
    })
  );

export const orderItemsRelations = relations(
  orderItems,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderItems.orderId],
      references: [orders.id],
    }),

    variant: one(productVariants, {
      fields: [orderItems.variantId],
      references: [productVariants.id],
    }),
  })
);

export const orderExchangesRelations =
  relations(
    orderExchanges,
    ({ one, many }) => ({
      order: one(orders, {
        fields: [orderExchanges.orderId],
        references: [orders.id],
      }),

      items: many(exchangeItems),
    })
  );

export const exchangeItemsRelations =
  relations(
    exchangeItems,
    ({ one }) => ({
      exchange: one(orderExchanges, {
        fields: [exchangeItems.exchangeId],
        references: [orderExchanges.id],
      }),

      variant: one(productVariants, {
        fields: [exchangeItems.variantId],
        references: [productVariants.id],
      }),
    })
  );