import { pgTable, uuid, varchar, text, smallint, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.model.js';
import { products } from './products.model.js';

export const storeReviewStatusEnum = pgEnum('store_review_status', ['pending', 'approved', 'rejected']);

export const reviews = pgTable('reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  authorName: varchar('author_name', { length: 255 }).default('Client').notNull(),
  rating: smallint('rating').notNull(),
  comment: text('comment').notNull(),
  isApproved: boolean('is_approved').default(false).notNull(),
  status: storeReviewStatusEnum('status').default('pending').notNull(),
  showInGeneral: boolean('show_in_general').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const storeReviews = pgTable('store_reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  authorName: varchar('author_name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).default('').notNull(),
  body: text('body').notNull(),
  rating: smallint('rating').default(5).notNull(),
  status: storeReviewStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reviewGallery = pgTable('review_gallery', {
  id: uuid('id').defaultRandom().primaryKey(),
  imageUrl: text('image_url').notNull(),
  altText: varchar('alt_text', { length: 255 }).default('Avis client').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, {
    fields: [reviews.productId],
    references: [products.id],
  }),
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
}));
