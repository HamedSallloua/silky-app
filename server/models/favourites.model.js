import { pgTable, uuid, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.model.js';
import { products } from './products.model.js';

export const favourites = pgTable('favourites', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  guestSessionId: uuid('guest_session_id'),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('idx_favourites_user_product').on(t.userId, t.productId).where(sql`user_id IS NOT NULL`),
  uniqueIndex('idx_favourites_guest_product').on(t.guestSessionId, t.productId).where(sql`guest_session_id IS NOT NULL`),
]);

export const favouritesRelations = relations(favourites, ({ one }) => ({
  user: one(users, {
    fields: [favourites.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [favourites.productId],
    references: [products.id],
  }),
}));
