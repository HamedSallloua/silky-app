import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.model.js';
import { orders } from './orders.model.js';

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    key: varchar('key', {
      length: 255,
    }).notNull(),

    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),

    guestSessionId: uuid('guest_session_id'),

    requestPath: varchar('request_path', {
      length: 255,
    }).notNull(),

    requestFingerprint: varchar('request_fingerprint', {
      length: 64,
    }).notNull(),

    orderId: uuid('order_id').references(() => orders.id, {
      onDelete: 'set null',
    }),

    responseStatus: integer('response_status')
      .default(201)
      .notNull(),

    status: varchar('status', {
      length: 32,
    })
      .default('in_progress')
      .notNull(),

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
  (table) => [
    uniqueIndex('idx_idempotency_user_key')
      .on(table.userId, table.key)
      .where(sql`${table.userId} IS NOT NULL`),

    uniqueIndex('idx_idempotency_guest_key')
      .on(table.guestSessionId, table.key)
      .where(sql`${table.guestSessionId} IS NOT NULL`),

    index('idx_idempotency_created_at').on(table.createdAt),

    check(
      'idempotency_shopper_exclusivity',
      sql`(${table.userId} IS NOT NULL AND ${table.guestSessionId} IS NULL) OR (${table.userId} IS NULL AND ${table.guestSessionId} IS NOT NULL)`
    ),

    check(
      'idempotency_status_valid',
      sql`${table.status} IN ('in_progress', 'completed')`
    ),
  ]
);

export const idempotencyKeysRelations = relations(
  idempotencyKeys,
  ({ one }) => ({
    user: one(users, {
      fields: [idempotencyKeys.userId],
      references: [users.id],
    }),
    order: one(orders, {
      fields: [idempotencyKeys.orderId],
      references: [orders.id],
    }),
  })
);
