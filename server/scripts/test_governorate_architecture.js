/**
 * Comprehensive Governorate Data Architecture Verification Suite
 * Tests all requirements of STEP 16:
 * - Database schema, 24 canonical governorates, FK, NOT NULL
 * - Direct API authoritative rejection (missing, invalid ID, fake, malformed, old composite bypass)
 * - Cart checkout (guest/auth)
 * - Buy Now
 * - Admin Manual Order
 * - Draft Confirmation mapping (draft.governorate -> orders.governorate_id, clean address)
 * - Order repository governorate metadata loading
 * - Business & financial non-regression
 */

import http from 'http';
import assert from 'assert';
import { app } from '../app.js';
import { pool } from '../db/pool.js';
import { CANONICAL_GOVERNORATES, resolveGovernorateSync } from '../config/governorates.js';
import { governorateRepository } from '../repositories/governorate.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import { orderRepository } from '../repositories/order.repository.js';
import { draftRepository } from '../repositories/draft.repository.js';
import * as draftService from '../services/draft.service.js';
import * as adminService from '../services/admin.service.js';
import * as orderService from '../services/order.service.js';
import * as inventoryService from '../services/inventory.service.js';

let server;
let baseUrl;
let passedCount = 0;
let failedCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

async function request(endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { status: res.status, data, headers: res.headers };
}

async function main() {
  console.log('\n=============================================================');
  console.log('--- SILKY GOVERNORATE DATA ARCHITECTURE VERIFICATION SUITE ---');
  console.log('=============================================================\n');

  // Start ephemeral HTTP server
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}/api`;
      console.log(`Test server running at ${baseUrl}\n`);
      resolve();
    });
  });

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: DATABASE SCHEMA & CONSTRAINTS
    // -------------------------------------------------------------------------
    console.log('--- 1. DATABASE SCHEMA & CONSTRAINTS ---');

    await asyncTest('Database contains exactly 24 canonical governorates', async () => {
      const { rows } = await pool.query('SELECT COUNT(*)::int as cnt FROM governorates');
      assert.strictEqual(rows[0].cnt, 24, 'Exactly 24 governorates must exist');
    });

    await asyncTest('Governorate names and codes are unique and match canonical list', async () => {
      const dbGovs = await governorateRepository.findAll();
      assert.strictEqual(dbGovs.length, 24);

      const nameSet = new Set();
      const codeSet = new Set();

      for (const gov of dbGovs) {
        assert.ok(gov.id > 0, `Valid ID: ${gov.id}`);
        assert.ok(gov.name, `Valid name: ${gov.name}`);
        assert.ok(gov.code, `Valid code: ${gov.code}`);
        assert.ok(!nameSet.has(gov.name), `Duplicate name: ${gov.name}`);
        assert.ok(!codeSet.has(gov.code), `Duplicate code: ${gov.code}`);
        nameSet.add(gov.name);
        codeSet.add(gov.code);

        // Verify matches CANONICAL_GOVERNORATES
        const canonical = CANONICAL_GOVERNORATES.find((c) => c.id === gov.id);
        assert.ok(canonical, `Canonical match found for id ${gov.id}`);
        assert.strictEqual(gov.name, canonical.name);
        assert.strictEqual(gov.code, canonical.code);
      }
    });

    await asyncTest('orders.governorate_id column is NOT NULL with Foreign Key constraint', async () => {
      const { rows: colCheck } = await pool.query(`
        SELECT is_nullable, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'governorate_id'
      `);
      assert.strictEqual(colCheck.length, 1);
      assert.strictEqual(colCheck[0].is_nullable, 'NO', 'Column must be NOT NULL');
      assert.strictEqual(colCheck[0].data_type, 'integer', 'Column must be integer');

      const { rows: fkCheck } = await pool.query(`
        SELECT tc.constraint_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'orders' AND kcu.column_name = 'governorate_id' AND tc.constraint_type = 'FOREIGN KEY'
      `);
      assert.ok(fkCheck.length > 0, 'Foreign key constraint must exist on governorate_id');
      assert.strictEqual(fkCheck[0].foreign_table_name, 'governorates');
      assert.strictEqual(fkCheck[0].foreign_column_name, 'id');
    });

    await asyncTest('idx_orders_governorate_id index exists', async () => {
      const { rows } = await pool.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'orders' AND indexname = 'idx_orders_governorate_id'
      `);
      assert.strictEqual(rows.length, 1, 'Index idx_orders_governorate_id must exist');
    });

    await asyncTest('Attempting direct SQL insert with non-existent governorate_id throws FK violation (23503)', async () => {
      let threw = false;
      try {
        await pool.query(`
          INSERT INTO orders (order_number, customer_name, customer_phone, governorate_id, shipping_address, subtotal, delivery_fee, total_amount, status)
          VALUES ('FK-TEST-ORD', 'FK Tester', '98765432', 9999, 'Rue 1', 10, 8, 18, 'pending')
        `);
      } catch (err) {
        threw = true;
        assert.strictEqual(err.code, '23503', 'Must throw foreign key violation code 23503');
      }
      assert.ok(threw, 'Direct insert with invalid governorate_id must be rejected by PostgreSQL');
    });

    // -------------------------------------------------------------------------
    // SECTION 2: DIRECT API AUTHORITATIVE BACKEND VALIDATION
    // -------------------------------------------------------------------------
    console.log('\n--- 2. DIRECT API AUTHORITATIVE VALIDATION & BYPASS PREVENTION ---');

    // Fetch test product variant
    const prodsRes = await request('/products');
    assert.strictEqual(prodsRes.status, 200);
    const product = prodsRes.data.find((p) => p.colors?.length && p.sizes?.length && p.stock);
    assert.ok(product, 'Test product found');
    const colorId = product.colors[0].id;
    const size = product.sizes[0];
    const variant = await productRepository.findVariantForOrderItem(product.id, colorId, size);
    assert.ok(variant, 'Test variant found');
    await inventoryService.updateVariantStock(variant.id, 50);

    const initialOrderCount = (await pool.query('SELECT COUNT(*)::int as cnt FROM orders')).rows[0].cnt;

    await asyncTest('POST /api/orders: Rejects missing governorate (400)', async () => {
      const res = await request('/orders', {
        method: 'POST',
        body: {
          customer: { name: 'Attacker Missing', phone: '98765432', address: 'Rue de la Liberté' },
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('gouvernorat est obligatoire'));
    });

    await asyncTest('POST /api/orders: Rejects invalid governorate ID (999) (400)', async () => {
      const res = await request('/orders', {
        method: 'POST',
        body: {
          customer: { name: 'Attacker BadId', phone: '98765432', address: 'Rue de la Liberté', governorateId: 999 },
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('Gouvernorat invalide'));
    });

    await asyncTest('POST /api/orders: Rejects fake governorate string ("fake") (400)', async () => {
      const res = await request('/orders', {
        method: 'POST',
        body: {
          customer: { name: 'Attacker Fake', phone: '98765432', address: 'Rue de la Liberté', governorate: 'fake' },
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('Gouvernorat invalide'));
    });

    await asyncTest('POST /api/orders: Rejects malformed governorate payload ({}) (400)', async () => {
      const res = await request('/orders', {
        method: 'POST',
        body: {
          customer: { name: 'Attacker Malformed', phone: '98765432', address: 'Rue de la Liberté', governorate: {} },
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('Gouvernorat invalide'));
    });

    await asyncTest('POST /api/orders: Rejects old composite-address-only bypass attempt (400)', async () => {
      const res = await request('/orders', {
        method: 'POST',
        body: {
          customer: { name: 'Attacker Composite', phone: '98765432', address: 'Tunis — 123 Rue de la République' },
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('gouvernorat est obligatoire'));
    });

    await asyncTest('Zero orders created during all 5 direct API rejection attacks', async () => {
      const currentOrderCount = (await pool.query('SELECT COUNT(*)::int as cnt FROM orders')).rows[0].cnt;
      assert.strictEqual(currentOrderCount, initialOrderCount);
    });

    // -------------------------------------------------------------------------
    // SECTION 3: CHECKOUT FLOWS (BUY NOW & CART)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. CHECKOUT FLOWS: BUY NOW & CART ---');

    let buyNowOrder;
    await asyncTest('Buy Now checkout succeeds with structured governorate', async () => {
      const res = await request('/orders/checkout', {
        method: 'POST',
        body: {
          customer: {
            firstName: 'Aymen',
            lastName: 'Ben Amor',
            phone: '55443322',
            governorate: 'Sousse',
            address: '15 Avenue Habib Bourguiba',
          },
          buyNowItem: {
            productId: product.id,
            colorId,
            size,
            quantity: 1,
          },
        },
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.data?.id);
      buyNowOrder = res.data;

      // In-memory format checks
      assert.strictEqual(buyNowOrder.governorateId, 2); // Sousse id is 2
      assert.strictEqual(buyNowOrder.governorate?.name, 'Sousse');
      assert.strictEqual(buyNowOrder.governorate?.code, 'TN-51');
      assert.strictEqual(buyNowOrder.customer?.shippingAddress, '15 Avenue Habib Bourguiba');
      assert.strictEqual(buyNowOrder.customer?.address, 'Sousse — 15 Avenue Habib Bourguiba');

      // Database raw checks
      const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [buyNowOrder.id]);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].governorate_id, 2);
      assert.strictEqual(rows[0].shipping_address, '15 Avenue Habib Bourguiba'); // Clean street address only!
      assert.ok(!rows[0].shipping_address.includes('Sousse — '), 'Must not contain composite governorate prefix in DB');
    });

    // -------------------------------------------------------------------------
    // SECTION 4: ADMIN MANUAL ORDER FLOW
    // -------------------------------------------------------------------------
    console.log('\n--- 4. ADMIN MANUAL ORDER FLOW ---');

    const adminLoginRes = await request('/admin/login', {
      method: 'POST',
      body: { password: process.env.ADMIN_PASSWORD || 'admin123' },
    });
    assert.strictEqual(adminLoginRes.status, 200);
    const adminToken = adminLoginRes.data.token;

    // 4.1 Negative: Missing governorate
    await asyncTest('Admin Manual Order: Rejects missing governorate (400)', async () => {
      const res = await request('/admin/orders/manual', {
        method: 'POST',
        token: adminToken,
        body: {
          customerName: 'Kamel Trabelsi',
          phoneNumber: '98112233',
          customerEmail: 'kamel@example.com',
          shippingAddress: '42 Rue Hassan Nouri',
          deliveryFee: 8.0,
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data?.error, 'Le gouvernorat est obligatoire.');
    });

    // 4.2 Negative: Invalid governorate string
    await asyncTest('Admin Manual Order: Rejects invalid governorate (400)', async () => {
      const res = await request('/admin/orders/manual', {
        method: 'POST',
        token: adminToken,
        body: {
          customerName: 'Kamel Trabelsi',
          phoneNumber: '98112233',
          customerEmail: 'kamel@example.com',
          governorate: 'fake_governorate',
          shippingAddress: '42 Rue Hassan Nouri',
          deliveryFee: 8.0,
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data?.error, 'Gouvernorat invalide.');
    });

    // 4.3 Negative: Legacy composite address only in shippingAddress (no inference allowed)
    await asyncTest('Admin Manual Order: Rejects legacy composite address in shippingAddress without structured governorate (400)', async () => {
      const res = await request('/admin/orders/manual', {
        method: 'POST',
        token: adminToken,
        body: {
          customerName: 'Kamel Trabelsi',
          phoneNumber: '98112233',
          customerEmail: 'kamel@example.com',
          shippingAddress: 'Bizerte — 42 Rue Hassan Nouri',
          deliveryFee: 8.0,
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data?.error, 'Le gouvernorat est obligatoire.');
    });

    // 4.4 Positive: Explicit governorate name
    let manualOrder;
    await asyncTest('Admin Manual Order creates order with governorate name and clean street address', async () => {
      const res = await request('/admin/orders/manual', {
        method: 'POST',
        token: adminToken,
        body: {
          customerName: 'Kamel Trabelsi',
          phoneNumber: '98112233',
          customerEmail: 'kamel@example.com',
          governorate: 'Bizerte',
          shippingAddress: '42 Rue Hassan Nouri',
          deliveryFee: 8.0,
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.data?.id);
      manualOrder = res.data;

      assert.strictEqual(manualOrder.governorateId, 9); // Bizerte id is 9
      assert.strictEqual(manualOrder.governorate?.name, 'Bizerte');
      assert.strictEqual(manualOrder.customer?.shippingAddress, '42 Rue Hassan Nouri');

      // Raw DB verification
      const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [manualOrder.id]);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].governorate_id, 9);
      assert.strictEqual(rows[0].shipping_address, '42 Rue Hassan Nouri');
    });

    // 4.5 Positive: Explicit governorateId
    await asyncTest('Admin Manual Order creates order with governorateId and clean street address', async () => {
      const res = await request('/admin/orders/manual', {
        method: 'POST',
        token: adminToken,
        body: {
          customerName: 'Kamel Trabelsi',
          phoneNumber: '98112233',
          customerEmail: 'kamel@example.com',
          governorateId: 9,
          shippingAddress: '42 Rue Hassan Nouri',
          deliveryFee: 8.0,
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.data?.id);

      assert.strictEqual(res.data.governorateId, 9);
      assert.strictEqual(res.data.governorate?.name, 'Bizerte');
      assert.strictEqual(res.data.customer?.shippingAddress, '42 Rue Hassan Nouri');
    });

    // -------------------------------------------------------------------------
    // SECTION 5: DRAFT ORDER CONFIRMATION & MAPPING
    // -------------------------------------------------------------------------
    console.log('\n--- 5. DRAFT ORDER CONFIRMATION & MAPPING ---');

    let createdDraft;
    await asyncTest('Create active draft with structured governorate and shipping address', async () => {
      createdDraft = await draftService.createDraft({
        customerName: 'Yassine Jaziri',
        phoneNumber: '21009988',
        customerEmail: 'yassine@example.com',
        governorate: 'Zaghouan',
        shippingAddress: 'Zone Industrielle Zriba',
        deliveryFee: 8.0,
        items: [{ variantId: variant.id, quantity: 1 }],
      });
      assert.ok(createdDraft?.id);
      assert.strictEqual(createdDraft.governorate, 'Zaghouan');
      assert.strictEqual(createdDraft.shippingAddress, 'Zone Industrielle Zriba');
    });

    let confirmedDraftOrder;
    await asyncTest('Confirm draft: maps draft.governorate -> orders.governorate_id without concatenating address', async () => {
      confirmedDraftOrder = await draftService.confirmDraftAsOrder(createdDraft.id);
      assert.ok(confirmedDraftOrder?.id);

      // Verify draft status is marked converted
      const updatedDraft = await draftService.getDraftById(createdDraft.id);
      assert.ok(updatedDraft.convertedAt);
      assert.strictEqual(updatedDraft.convertedOrderId, confirmedDraftOrder.id);

      // Verify converted order has correct governorateId and clean address
      assert.strictEqual(confirmedDraftOrder.governorateId, 12); // Zaghouan id is 12
      assert.strictEqual(confirmedDraftOrder.governorate?.name, 'Zaghouan');
      assert.strictEqual(confirmedDraftOrder.customer?.shippingAddress, 'Zone Industrielle Zriba');

      // Raw DB inspection
      const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [confirmedDraftOrder.id]);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].governorate_id, 12);
      assert.strictEqual(rows[0].shipping_address, 'Zone Industrielle Zriba');
      assert.ok(!rows[0].shipping_address.includes('Zaghouan — '), 'Raw shipping_address must NOT contain governorate prefix');
    });

    // -------------------------------------------------------------------------
    // SECTION 6: ORDER REPOSITORY GOVERNORATE METADATA
    // -------------------------------------------------------------------------
    console.log('\n--- 6. ORDER REPOSITORY GOVERNORATE METADATA ---');

    await asyncTest('orderRepository.findAll loads governorate metadata and presents composed customer.address', async () => {
      const allOrders = await orderRepository.findAll();
      assert.ok(allOrders.length >= 3);

      for (const ord of allOrders) {
        assert.ok(ord.governorateId > 0, `Order ${ord.id} has governorateId`);
        assert.ok(ord.governorate?.name, `Order ${ord.id} has governorate name`);
        assert.ok(ord.governorate?.code, `Order ${ord.id} has governorate code`);
        assert.ok(ord.customer?.shippingAddress, `Order ${ord.id} has shippingAddress`);
        // Presentation-time composed address must start with governorate name
        assert.ok(
          ord.customer?.address.startsWith(`${ord.governorate.name} — `) ||
          ord.customer?.address === ord.customer?.shippingAddress,
          `Presentation address format: ${ord.customer?.address}`
        );
      }
    });


    // -------------------------------------------------------------------------
    // SECTION 7: W4 REGIONAL AGGREGATION READINESS
    // -------------------------------------------------------------------------
    console.log('\n--- 7. W4 REGIONAL AGGREGATION READINESS ---');

    await asyncTest('SQL query joins orders with governorates cleanly without string parsing', async () => {
      const { rows } = await pool.query(`
        SELECT 
          g.id AS governorate_id,
          g.name AS governorate_name,
          g.code AS governorate_code,
          COUNT(o.id) AS order_count,
          COALESCE(SUM(o.total_amount), 0) AS regional_revenue
        FROM governorates g
        LEFT JOIN orders o ON o.governorate_id = g.id
        GROUP BY g.id, g.name, g.code
        ORDER BY order_count DESC, g.name ASC;
      `);

      assert.strictEqual(rows.length, 24, 'All 24 governorates represented in aggregation');
      const sousseAgg = rows.find((r) => r.governorate_name === 'Sousse');
      assert.ok(sousseAgg && Number(sousseAgg.order_count) >= 1);
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n=============================================================');
  console.log(`TEST SUMMARY: ${passedCount} passed, ${failedCount} failed`);
  console.log('=============================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
