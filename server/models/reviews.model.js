import {
  pgTable,
  uuid,
  varchar,
  text,
  smallint,
  boolean,
  timestamp,
  pgEnum,
  index,
  check,
} from 'drizzle-orm/pg-core';

import { relations, sql } from 'drizzle-orm';

import { users } from './users.model.js';
import { products } from './products.model.js';

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

export const storeReviewStatusEnum = pgEnum(
  'store_review_status',
  ['pending', 'approved', 'rejected']
);

// -----------------------------------------------------------------------------
// Product reviews
// -----------------------------------------------------------------------------

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, {
        onDelete: 'cascade',
      }),

    userId: uuid('user_id')
      .references(() => users.id, {
        onDelete: 'cascade',
      }),

    authorName: varchar('author_name', {
      length: 255,
    }).default('Client').notNull(),

    rating: smallint('rating').notNull(),

    comment: text('comment').notNull(),

    isApproved: boolean('is_approved')
      .default(false)
      .notNull(),

    status: storeReviewStatusEnum('status')
      .default('pending')
      .notNull(),

    showInGeneral: boolean('show_in_general')
      .default(false)
      .notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_reviews_product_id').on(
      table.productId
    ),

    index('idx_reviews_user_id').on(
      table.userId
    ),

    index('idx_reviews_is_approved')
      .on(table.isApproved)
      .where(sql`${table.isApproved} = true`),

    index('idx_reviews_show_in_general')
      .on(table.showInGeneral)
      .where(sql`${table.showInGeneral} = true`),

    check(
      'reviews_rating_range',
      sql`${table.rating} BETWEEN 1 AND 5`
    ),
  ]
);

// -----------------------------------------------------------------------------
// General store reviews
// -----------------------------------------------------------------------------

export const storeReviews = pgTable(
  'store_reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    authorName: varchar('author_name', {
      length: 255,
    }).notNull(),

    email: varchar('email', {
      length: 255,
    }).default('').notNull(),

    body: text('body').notNull(),

    rating: smallint('rating')
      .default(5)
      .notNull(),

    status: storeReviewStatusEnum('status')
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
    index('idx_store_reviews_status').on(
      table.status
    ),

    index('idx_store_reviews_created_at').on(
      table.createdAt
    ),

    check(
      'store_reviews_rating_range',
      sql`${table.rating} BETWEEN 1 AND 5`
    ),
  ]
);

// -----------------------------------------------------------------------------
// Review gallery
// -----------------------------------------------------------------------------

export const reviewGallery = pgTable(
  'review_gallery',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    imageUrl: text('image_url').notNull(),

    altText: varchar('alt_text', {
      length: 255,
    })
      .default('Avis client')
      .notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).defaultNow().notNull(),
  }
);

// -----------------------------------------------------------------------------
// Relations
// -----------------------------------------------------------------------------

export const reviewsRelations = relations(
  reviews,
  ({ one }) => ({
    product: one(products, {
      fields: [reviews.productId],
      references: [products.id],
    }),

    user: one(users, {
      fields: [reviews.userId],
      references: [users.id],
    }),
  })
);