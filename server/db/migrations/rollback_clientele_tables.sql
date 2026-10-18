-- ==============================================================================
-- Silky — Clientèle Database Object Rollback & Cleanup Migration (FAIL-SAFE)
-- File: server/db/migrations/rollback_clientele_tables.sql
-- Review Date: 2026-10-17
-- Target Environment: ISOLATED STAGING / SEPARATE AUTHORIZED ENVIRONMENT ONLY
--
-- SAFETY CONSTRAINTS:
-- 1. DO NOT execute this script against the local 'silky' database.
-- 2. DO NOT apply without a verified full database backup (pg_dump).
-- 3. All statements enforce RESTRICT fail-safe behavior instead of CASCADE.
--    If an unreviewed external view, constraint, or table references any of
--    these objects, PostgreSQL will reject the drop and ROLLBACK the transaction.
--
-- PERMANENT DATA LOSS INVENTORY:
-- 1. product_visits (VIEW):
--    - Derived view; zero persistent table data lost.
-- 2. analytics_events (TABLE):
--    - Raw clickstream & behavioral telemetry permanently lost:
--      page views, product views, variant selections, cart additions/removals,
--      favorites toggling, search query logs, and checkout initiation records.
-- 3. user_first_touch (TABLE):
--    - Marketing attribution records permanently lost:
--      first touch source/referrer URLs and registration visit attribution.
-- 4. identity_links (TABLE):
--    - Cross-session identity resolution graph permanently lost:
--      links between user IDs and historical anonymous guest session UUIDs.
-- 5. visit_sessions (TABLE):
--    - Session telemetry permanently lost:
--      session start/end timestamps, duration, page count, traffic source,
--      referrer URL, user agent, and device type ('mobile', 'tablet', 'desktop').
-- 6. guest_profile_sessions (TABLE):
--    - Mapping records permanently lost:
--      associations between guest profiles and guest session UUIDs.
-- 7. guest_profiles (TABLE):
--    - CRM guest identity profiles permanently lost:
--      voluntarily submitted guest email, phone, and display name records.
--
-- RETAINED CORE APPLICATION DATA (COMPLETELY PRESERVED):
-- - users, password_resets (Authentication intact)
-- - products, product_variants, product_images, categories (Catalog intact)
-- - orders, order_items, order_exchanges, exchange_items, order_refunds (Orders intact)
-- - drafts, draft_items, draft_conversions (Drafts intact)
-- - carts, cart_items, favourites (Shopper carts & favourites intact)
-- - reviews, store_reviews, review_gallery (Reviews intact)
-- - contact_messages (Customer service intact)
-- - governorates (24 canonical Tunisian governorates intact)
-- - site_settings, admin_notifications, idempotency_keys (Operations intact)
-- ==============================================================================

BEGIN;

-- Step 1: Drop the dependent view first using RESTRICT.
-- product_visits is a VIEW querying analytics_events.
-- Removing it first ensures analytics_events has no dependent view.
DROP VIEW IF EXISTS product_visits RESTRICT;

-- Step 2: Drop behavioral analytics events table using RESTRICT.
-- Outgoing Foreign Keys (dropped automatically with the table):
--   - user_id REFERENCES users(id) ON DELETE SET NULL
--   - visit_session_id REFERENCES visit_sessions(id) ON DELETE SET NULL
--   - product_id REFERENCES products(id) ON DELETE SET NULL
--   - variant_id REFERENCES product_variants(id) ON DELETE SET NULL
--   - order_id REFERENCES orders(id) ON DELETE SET NULL
-- With product_visits view dropped in Step 1, no objects depend on analytics_events.
-- RESTRICT guarantees that if any unforeseen dependent object exists, the transaction aborts.
DROP TABLE IF EXISTS analytics_events RESTRICT;

-- Step 3: Drop first-touch attribution table using RESTRICT.
-- Outgoing Foreign Keys:
--   - user_id REFERENCES users(id) ON DELETE CASCADE
--   - first_visit_session_id REFERENCES visit_sessions(id) ON DELETE SET NULL
--   - registration_visit_session_id REFERENCES visit_sessions(id) ON DELETE SET NULL
DROP TABLE IF EXISTS user_first_touch RESTRICT;

-- Step 4: Drop identity links table using RESTRICT.
-- Outgoing Foreign Keys:
--   - user_id REFERENCES users(id) ON DELETE CASCADE
DROP TABLE IF EXISTS identity_links RESTRICT;

-- Step 5: Drop visit sessions table using RESTRICT.
-- Outgoing Foreign Keys:
--   - user_id REFERENCES users(id) ON DELETE SET NULL
-- Incoming Foreign Keys:
--   - analytics_events.visit_session_id (already dropped in Step 2)
--   - user_first_touch.first_visit_session_id (already dropped in Step 3)
--   - user_first_touch.registration_visit_session_id (already dropped in Step 3)
-- Since all referencing tables have been dropped, RESTRICT safely drops visit_sessions.
DROP TABLE IF EXISTS visit_sessions RESTRICT;

-- Step 6: Drop guest profile sessions mapping table using RESTRICT.
-- Outgoing Foreign Keys:
--   - guest_profile_id REFERENCES guest_profiles(id) ON DELETE CASCADE
-- Must be dropped prior to guest_profiles to satisfy foreign-key constraint.
DROP TABLE IF EXISTS guest_profile_sessions RESTRICT;

-- Step 7: Drop guest profiles CRM table using RESTRICT.
-- Incoming Foreign Keys:
--   - guest_profile_sessions.guest_profile_id (already dropped in Step 6)
-- Since the only referencing table has been dropped, RESTRICT safely drops guest_profiles.
DROP TABLE IF EXISTS guest_profiles RESTRICT;

COMMIT;
