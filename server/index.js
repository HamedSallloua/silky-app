import './config/env.js';
import { app, ensureUploadsDir, env } from './app.js';
import { verifyConnection, pool } from './db/pool.js';
import { runExchangesMigration } from './db/migrations/add_exchanges.js';
import { runRefundsMigration } from './db/migrations/add_refunds.js';
import { runAnnouncementsMigration } from './db/migrations/add_announcements.js';
import { runFavouritesVariantMigration } from './db/migrations/add_favourites_variant.js';
import { runIdempotencyKeysMigration } from './db/migrations/add_idempotency_keys.js';
import { runNotificationsMigration } from './db/migrations/add_notifications.js';
import { runRemoveOrderSourceMigration } from './db/migrations/remove_order_source.js';
import { runProductVideosMigration } from './db/migrations/add_product_videos.js';
import { runHeroConfigMigration } from './db/migrations/add_hero_config.js';
import { runReviewIdentityFieldsMigration } from './db/migrations/add_review_identity_fields.js';
import { runStoreReviewIdentityFieldsMigration } from './db/migrations/add_store_review_identity_fields.js';
import { runContactMessageGuestSessionMigration } from './db/migrations/add_contact_message_guest_session.js';
import { runUsersIdentityCheckMigration } from './db/migrations/add_users_identity_check.js';
import { runDraftTablesMigration } from './db/migrations/add_draft_tables.js';
import { runGovernoratesMigration } from './db/migrations/add_governorates.js';
import { runDeliveredStatusMigration } from './db/migrations/add_delivered_status.js';
import { runExchangeFinancialDifferenceFieldsMigration } from './db/migrations/add_exchange_financial_difference_fields.js';

async function start() {
  await ensureUploadsDir();
  await verifyConnection();
  await runExchangesMigration(pool);
  await runRefundsMigration(pool);
  await runAnnouncementsMigration(pool);
  await runHeroConfigMigration(pool);
  await runFavouritesVariantMigration(pool);
  await runIdempotencyKeysMigration(pool);
  await runNotificationsMigration(pool);
  await runRemoveOrderSourceMigration(pool);
  await runProductVideosMigration(pool);
  await runReviewIdentityFieldsMigration(pool);
  await runStoreReviewIdentityFieldsMigration(pool);
  await runContactMessageGuestSessionMigration(pool);
  await runUsersIdentityCheckMigration(pool);
  await runDraftTablesMigration(pool);
  await runGovernoratesMigration(pool);
  await runDeliveredStatusMigration(pool);
  await runExchangeFinancialDifferenceFieldsMigration(pool);

  app.listen(env.port, () => {
    console.log(`Silky API running on http://localhost:${env.port}`);
    console.log(`Admin email: ${env.adminEmail} (seed with npm run db:seed)`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
