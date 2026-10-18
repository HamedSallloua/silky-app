import {
  pgTable,
  smallint,
  varchar,
  text,
  numeric,
  timestamp,
  boolean,
  check,
} from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';

export const siteSettings = pgTable(
  'site_settings',
  {
    id: smallint('id').default(1).primaryKey(),

    primaryColor: varchar('primary_color', {
      length: 7,
    })
      .default('#8D191C')
      .notNull(),

    secondaryColor: varchar('secondary_color', {
      length: 7,
    })
      .default('#F3EBEC')
      .notNull(),

    heroLeftImage: text('hero_left_image')
      .default('/pictures/femme_example.jpg')
      .notNull(),

    heroRightImage: text('hero_right_image')
      .default('/pictures/enfant_example.jpg')
      .notNull(),

    deliveryFee: numeric('delivery_fee', {
      precision: 10,
      scale: 3,
    })
      .default('8.000')
      .notNull(),

    announcements: text('announcements'),
    announcementsHidden: boolean('announcements_hidden').default(false).notNull(),
    heroConfig: text('hero_config'),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      'site_settings_id_check',
      sql`${t.id} = 1`,
    ),
  ],
);