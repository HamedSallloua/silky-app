import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';

import { relations } from 'drizzle-orm';

export const userRoleEnum = pgEnum(
  'user_role',
  ['customer', 'admin'],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .defaultRandom()
      .primaryKey(),

    email: varchar('email', {
      length: 255,
    }).unique(),

    passwordHash: varchar('password_hash', {
      length: 255,
    }).notNull(),

    role: userRoleEnum('role')
      .default('customer')
      .notNull(),

    fullName: varchar('full_name', {
      length: 255,
    }).notNull(),

    phoneNumber: varchar('phone_number', {
      length: 32,
    }).unique(),

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
);

export const passwordResets = pgTable(
  'password_resets',
  {
    id: uuid('id')
      .defaultRandom()
      .primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'cascade',
      }),

    tokenHash: varchar('token_hash', {
      length: 255,
    })
      .notNull()
      .unique(),

    expiresAt: timestamp('expires_at', {
      withTimezone: true,
    }).notNull(),

    used: boolean('used')
      .default(false)
      .notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('idx_password_resets_user_id').on(t.userId),

    index('idx_password_resets_expires_at')
      .on(t.expiresAt)
      .where(t.used === false),
  ],
);

export const usersRelations = relations(
  users,
  ({ many }) => ({
    passwordResets: many(passwordResets),
  }),
);

export const passwordResetsRelations = relations(
  passwordResets,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResets.userId],
      references: [users.id],
    }),
  }),
);