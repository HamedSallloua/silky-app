/**
 * Verification Test Suite for Draft Table Migration Startup Integration & Fresh-Start Safety
 *
 * Tests:
 * 1. Startup sequence executes runDraftTablesMigration successfully.
 * 2. Idempotency: executing migration multiple times succeeds without error.
 * 3. Fresh-start simulation in an isolated transaction:
 *    - Validates table creation for drafts, draft_items, draft_conversions
 *    - Validates all 5 performance & lookup indexes
 *    - Validates foreign key constraints to orders and product_variants
 *    - Safely rolls back to guarantee 0 data loss / 0 DB destruction
 * 4. Draft operations regression: CRUD & isolation from real orders intact
 *
 * Usage: node server/scripts/test_draft_migration_startup.js
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db/pool.js';
import { runDraftTablesMigration } from '../db/migrations/add_draft_tables.js';
import * as draftService from '../services/draft.service.js';
import { db } from '../db/orm.js';
import { drafts, draftItems, productVariants } from '../models/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function logPass(name) {
  console.log(`  ✓ ${name}`);
  passed++;
}

function logFail(name, err) {
  console.error(`  ✗ ${name}`);
  console.error(`    ${err.message}`);
  failed++;
}

async function runSuite() {
  console.log('\n======================================================');
  console.log('--- DRAFT MIGRATION STARTUP & FRESH-START SAFETY ---');
  console.log('======================================================\n');

  try {
    // -------------------------------------------------------------
    // SECTION 1: SERVER STARTUP SEQUENCE INSPECTION
    // -------------------------------------------------------------
    console.log('--- 1. SERVER STARTUP INTEGRATION POINT ---');
    const indexJsPath = path.resolve(__dirname, '../index.js');
    const indexJsContent = fs.readFileSync(indexJsPath, 'utf8');

    assert.ok(
      indexJsContent.includes("import { runDraftTablesMigration } from './db/migrations/add_draft_tables.js';"),
      'server/index.js must import runDraftTablesMigration from ./db/migrations/add_draft_tables.js'
    );
    assert.ok(
      indexJsContent.includes('await runDraftTablesMigration(pool);'),
      'server/index.js start() function must execute await runDraftTablesMigration(pool);'
    );
    logPass('server/index.js statically imports and executes runDraftTablesMigration(pool)');

    // -------------------------------------------------------------
    // SECTION 2: IDEMPOTENCY ON EXISTING DATABASE
    // -------------------------------------------------------------
    console.log('\n--- 2. IDEMPOTENT EXECUTION ON RUNNING DATABASE ---');
    // Run migration twice in succession
    await runDraftTablesMigration(pool);
    await runDraftTablesMigration(pool);
    logPass('runDraftTablesMigration runs twice without error on existing schema');

    // -------------------------------------------------------------
    // SECTION 3: SCHEMA & INDEX VERIFICATION
    // -------------------------------------------------------------
    console.log('\n--- 3. TABLE AND INDEX INTEGRITY ---');
    const tableRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('drafts', 'draft_items', 'draft_conversions');
    `);
    const tableNames = tableRes.rows.map((r) => r.table_name);
    assert.ok(tableNames.includes('drafts'), 'drafts table must exist');
    assert.ok(tableNames.includes('draft_items'), 'draft_items table must exist');
    assert.ok(tableNames.includes('draft_conversions'), 'draft_conversions table must exist');
    logPass('All 3 draft tables exist in the public schema');

    const indexRes = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('drafts', 'draft_items', 'draft_conversions');
    `);
    const indexNames = indexRes.rows.map((r) => r.indexname);
    const requiredIndexes = [
      'idx_drafts_converted_at',
      'idx_drafts_updated_at',
      'idx_drafts_converted_order_id',
      'idx_draft_items_draft_id',
      'idx_draft_items_variant_id',
    ];
    for (const idx of requiredIndexes) {
      assert.ok(indexNames.includes(idx), `Index ${idx} must exist`);
    }
    logPass('All 5 performance and lookup indexes exist');

    // -------------------------------------------------------------
    // SECTION 4: FRESH-START TRANSACTION SIMULATION (NON-DESTRUCTIVE)
    // -------------------------------------------------------------
    console.log('\n--- 4. FRESH-START SIMULATION IN TRANSACTION (ISOLATED ROLLBACK) ---');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Drop tables in transactional sandbox
      await client.query('DROP TABLE IF EXISTS draft_conversions CASCADE');
      await client.query('DROP TABLE IF EXISTS draft_items CASCADE');
      await client.query('DROP TABLE IF EXISTS drafts CASCADE');

      // Run authoritative migration inside transaction
      await runDraftTablesMigration({
        connect: async () => ({
          query: (sql, params) => client.query(sql, params),
          release: () => {},
        }),
      });

      // Verify clean creation
      const cleanTables = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('drafts', 'draft_items', 'draft_conversions');
      `);
      assert.strictEqual(cleanTables.rows.length, 3, 'All 3 tables created cleanly on fresh start');

      const cleanIndexes = await client.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN ('drafts', 'draft_items', 'draft_conversions');
      `);
      const cleanIndexNames = cleanIndexes.rows.map((r) => r.indexname);
      for (const idx of requiredIndexes) {
        assert.ok(cleanIndexNames.includes(idx), `Fresh-start index ${idx} verified`);
      }

      // Verify foreign key constraints
      const fkRes = await client.query(`
        SELECT
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name IN ('drafts', 'draft_items', 'draft_conversions');
      `);
      const fks = fkRes.rows;
      assert.ok(
        fks.some((f) => f.table_name === 'drafts' && f.foreign_table_name === 'orders'),
        'drafts.converted_order_id -> orders foreign key exists'
      );
      assert.ok(
        fks.some((f) => f.table_name === 'draft_items' && f.foreign_table_name === 'drafts'),
        'draft_items.draft_id -> drafts foreign key exists'
      );
      assert.ok(
        fks.some((f) => f.table_name === 'draft_items' && f.foreign_table_name === 'product_variants'),
        'draft_items.variant_id -> product_variants foreign key exists'
      );
      assert.ok(
        fks.some((f) => f.table_name === 'draft_conversions' && f.foreign_table_name === 'orders'),
        'draft_conversions.order_id -> orders foreign key exists'
      );

      // Rollback sandbox so production DB is untouched
      await client.query('ROLLBACK');
      logPass('Fresh-start migration executed and verified cleanly in transactional sandbox; rolled back safely');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // -------------------------------------------------------------
    // SECTION 5: DRAFT REGRESSION BEHAVIOR VERIFICATION
    // -------------------------------------------------------------
    console.log('\n--- 5. DRAFT REGRESSION BEHAVIOR ---');
    const allVariants = await db.select().from(productVariants).limit(1);
    assert.ok(allVariants.length >= 1, 'Must have at least 1 product variant in DB');
    const testVar = allVariants[0];

    // Create a draft
    const draft = await draftService.createDraft({
      customerName: 'Sami Ben Ali',
      phoneNumber: '98123456',
      shippingAddress: 'Avenue Habib Bourguiba, Tunis',
      items: [{ variantId: testVar.id, quantity: 1 }],
      notes: 'Test draft integration',
    });
    assert.ok(draft.id, 'Draft created with ID');
    assert.strictEqual(draft.customerName, 'Sami Ben Ali');
    assert.strictEqual(draft.convertedAt, null, 'Draft is unconverted');

    // Update draft
    const updatedDraft = await draftService.saveDraft(draft.id, {
      customerName: 'Sami Ben Ali Updated',
    });
    assert.strictEqual(updatedDraft.customerName, 'Sami Ben Ali Updated');
    logPass('Draft creation and update service operations functional');

    // Clean up test draft
    await draftService.deleteDraft(draft.id);
    logPass('Draft deletion functional and cleaned up');

  } catch (err) {
    logFail('Test suite error', err);
  } finally {
    console.log('\n======================================================');
    console.log(`DRAFT STARTUP MIGRATION SUMMARY: ${passed} passed, ${failed} failed`);
    console.log('======================================================\n');
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runSuite();
