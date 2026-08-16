import {
  pgTable,
  uuid,
  integer,
  timestamp,
  unique,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.model.js';
import { productVariants } from './products.model.js';

export const carts = pgTable(
  'carts',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),

    guestSessionId: uuid('guest_session_id'),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('idx_carts_user_id')
      .on(t.userId)
      .where(sql`${t.userId} IS NOT NULL`),

    index('idx_carts_guest_session_id')
      .on(t.guestSessionId)
      .where(sql`${t.guestSessionId} IS NOT NULL`),

    check(
      'carts_owner_check',
      sql`${t.userId} IS NOT NULL OR ${t.guestSessionId} IS NOT NULL`,
    ),
  ],
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, {
        onDelete: 'cascade',
      }),

    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, {
        onDelete: 'cascade',
      }),

    quantity: integer('quantity').notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique('uq_cart_items_cart_variant').on(t.cartId, t.variantId),

    index('idx_cart_items_cart_id').on(t.cartId),

    index('idx_cart_items_variant_id').on(t.variantId),

    check(
      'cart_items_quantity_check',
      sql`${t.quantity} > 0`,
    ),
  ],
);

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, {
    fields: [carts.userId],
    references: [users.id],
  }),

  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, {
    fields: [cartItems.cartId],
    references: [carts.id],
  }),

  variant: one(productVariants, {
    fields: [cartItems.variantId],
    references: [productVariants.id],
  }),
}));