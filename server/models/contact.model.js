import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { relations, sql } from 'drizzle-orm';
import { users } from './users.model.js';

export const contactMessages = pgTable(
  'contact_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    guestSessionId: uuid('guest_session_id'),

    firstName: varchar('first_name', {
      length: 255,
    }).notNull(),

    lastName: varchar('last_name', {
      length: 255,
    }).notNull(),

    email: varchar('email', {
      length: 255,
    }).notNull(),

    message: text('message').notNull(),

    status: varchar('status', {
      length: 32,
    })
      .notNull()
      .default('pending'),

    repliedAt: timestamp('replied_at', {
      withTimezone: true,
    }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('idx_contact_messages_created_at').on(t.createdAt),
    index('idx_contact_messages_guest_session_id')
      .on(t.guestSessionId)
      .where(sql`${t.guestSessionId} IS NOT NULL`),
  ],
);

export const contactMessagesRelations = relations(
  contactMessages,
  ({ one }) => ({
    user: one(users, {
      fields: [contactMessages.userId],
      references: [users.id],
    }),
  }),
);