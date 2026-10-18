import {
  pgTable,
  uuid,
  timestamp,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';

import { relations, sql } from 'drizzle-orm';
import { users } from './users.model.js';
import { products, productVariants } from './products.model.js';

export const favourites = pgTable(
  'favourites',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),

    guestSessionId: uuid('guest_session_id'),

    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, {
        onDelete: 'cascade',
      }),

    variantId: uuid('variant_id')
      .references(() => productVariants.id, {
        onDelete: 'cascade',
      }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('idx_favourites_user_variant')
      .on(t.userId, t.variantId)
      .where(sql`${t.userId} IS NOT NULL AND ${t.variantId} IS NOT NULL`),

    uniqueIndex('idx_favourites_guest_variant')
      .on(t.guestSessionId, t.variantId)
      .where(sql`${t.guestSessionId} IS NOT NULL AND ${t.variantId} IS NOT NULL`),

    uniqueIndex('idx_favourites_user_product_null_variant')
      .on(t.userId, t.productId)
      .where(sql`${t.userId} IS NOT NULL AND ${t.variantId} IS NULL`),

    uniqueIndex('idx_favourites_guest_product_null_variant')
      .on(t.guestSessionId, t.productId)
      .where(sql`${t.guestSessionId} IS NOT NULL AND ${t.variantId} IS NULL`),

    index('idx_favourites_product_id').on(t.productId),

    index('idx_favourites_variant_id').on(t.variantId),

    index('idx_favourites_guest_session_id')
      .on(t.guestSessionId)
      .where(sql`${t.guestSessionId} IS NOT NULL`),

    check(
      'favourites_owner_check',
      sql`${t.userId} IS NOT NULL OR ${t.guestSessionId} IS NOT NULL`,
    ),
  ],
);

export const favouritesRelations = relations(
  favourites,
  ({ one }) => ({
    user: one(users, {
      fields: [favourites.userId],
      references: [users.id],
    }),

    product: one(products, {
      fields: [favourites.productId],
      references: [products.id],
    }),

    variant: one(productVariants, {
      fields: [favourites.variantId],
      references: [productVariants.id],
    }),
  }),
);