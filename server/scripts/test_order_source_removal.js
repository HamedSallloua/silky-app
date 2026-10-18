import assert from 'assert';
import '../config/env.js';
import { pool } from '../db/pool.js';
import * as adminService from '../services/admin.service.js';
import * as draftService from '../services/draft.service.js';
import * as orderService from '../services/order.service.js';
import { orderRepository } from '../repositories/order.repository.js';
import { draftRepository } from '../repositories/draft.repository.js';
import { analyticsRepository } from '../repositories/analytics.repository.js';

async function runTests() {
  console.log('=== Starting Complete Order Source Removal Verification ===\n');

  // 1. Database Schema Verification
  console.log('1. Checking Database Schema...');
  const colRes = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE column_name = 'order_source'
  `);
  assert.strictEqual(colRes.rows.length, 0, 'No order_source columns should exist in any table');

  const typRes = await pool.query(`
    SELECT typname FROM pg_type WHERE typname = 'order_source'
  `);
  assert.strictEqual(typRes.rows.length, 0, 'No order_source enum type should exist');

  const idxRes = await pool.query(`
    SELECT indexname FROM pg_indexes WHERE indexname = 'idx_orders_order_source'
  `);
  assert.strictEqual(idxRes.rows.length, 0, 'No idx_orders_order_source index should exist');
  console.log('   ✅ DB Schema is completely clean of order_source\n');

  // Get an available variant for testing
  const { rows: variants } = await pool.query(`
    SELECT pv.id as variant_id, pv.product_id, pv.stock_quantity, p.price
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.stock_quantity > 10 AND p.is_active = true
    LIMIT 1
  `);
  assert(variants.length > 0, 'Need at least 1 active variant with stock > 10');
  const testVariant = variants[0];

  // 2. Manual Order Creation Without orderSource
  console.log('2. Testing Manual Order Creation without orderSource...');
  const manualOrder = await adminService.createManualOrder({
    customerName: 'Test Manual Order Client',
    phoneNumber: '98765432',
    customerEmail: 'manual@test.com',
    governorate: 'Tunis',
    shippingAddress: '123 Rue de la Liberté',
    items: [{ variantId: testVariant.variant_id, quantity: 1 }],
  });
  assert(manualOrder?.id, 'Manual order should be created');
  assert.strictEqual(manualOrder.orderSource, undefined, 'Order object must NOT contain orderSource');
  console.log(`   ✅ Manual Order created: ${manualOrder.orderNumber} (orderSource is undefined)\n`);

  // 3. Draft Lifecycle Without orderSource
  console.log('3. Testing Draft Lifecycle without orderSource...');
  // 3a. Create Draft
  const draft = await draftService.createDraft({
    customerName: 'Draft Test Customer',
    phoneNumber: '91234567',
    customerEmail: 'draft@test.com',
    governorate: 'Ariana',
    shippingAddress: 'Avenue Habib Bourguiba',
    deliveryFee: 7,
    notes: 'Draft test notes',
    items: [{ variantId: testVariant.variant_id, quantity: 1 }],
  });
  assert(draft?.id, 'Draft should be created');
  assert.strictEqual(draft.orderSource, undefined, 'Draft object must NOT contain orderSource');
  console.log('   ✅ Draft created without orderSource');

  // 3b. Update Draft
  const updatedDraft = await draftService.saveDraft(draft.id, {
    customerName: 'Draft Test Customer Updated',
    phoneNumber: '91234567',
    governorate: 'Tunis',
    shippingAddress: 'Avenue Habib Bourguiba Updated',
    notes: 'Updated notes',
    items: [{ variantId: testVariant.variant_id, quantity: 1 }],
  });
  assert.strictEqual(updatedDraft.customerName, 'Draft Test Customer Updated');
  assert.strictEqual(updatedDraft.orderSource, undefined, 'Updated draft must NOT contain orderSource');
  console.log('   ✅ Draft updated without orderSource');

  // 3c. Confirm Draft into Real Order
  const confirmedOrder = await draftService.confirmDraftAsOrder(draft.id);
  assert(confirmedOrder?.id, 'Confirmed order should be created from draft');
  assert.strictEqual(confirmedOrder.orderSource, undefined, 'Confirmed order must NOT contain orderSource');
  console.log(`   ✅ Draft confirmed into order: ${confirmedOrder.orderNumber}\n`);

  // 4. Cart Checkout & Direct Buy-Now Without orderSource
  console.log('4. Testing Checkout Flows...');
  // 4a. Direct Checkout (Buy Now)
  const directOrder = await orderService.checkoutDirect({
    customer: {
      name: 'Direct Buy Customer',
      phone: '99887766',
      address: 'Sousse — Centre Ville',
      email: 'direct@test.com',
    },
    shopper: { userId: null, guestSessionId: '00000000-0000-0000-0000-000000000001' },
    item: {
      variantId: testVariant.variant_id,
      quantity: 1,
    },
  });
  assert(directOrder?.id, 'Direct order should be created');
  assert.strictEqual(directOrder.orderSource, undefined, 'Direct order must NOT contain orderSource');
  console.log(`   ✅ Buy Now direct order created: ${directOrder.orderNumber}`);

  // 4b. Standard createOrder
  const standardOrder = await orderService.createOrder({
    customer: {
      name: 'Standard Order Customer',
      phone: '95554433',
      address: 'Sfax — Route de Téniour',
      email: 'standard@test.com',
    },
    items: [{ variantId: testVariant.variant_id, quantity: 1 }],
  });
  assert(standardOrder?.id, 'Standard order should be created');
  assert.strictEqual(standardOrder.orderSource, undefined, 'Standard order must NOT contain orderSource');
  console.log(`   ✅ Standard order created: ${standardOrder.orderNumber}\n`);

  // 5. Order Retrieval Formats
  console.log('5. Testing Order Retrieval Repository formatting...');
  const fetchedOrder = await orderRepository.findById(standardOrder.id);
  assert.strictEqual(fetchedOrder.orderSource, undefined, 'orderRepository.findById must NOT return orderSource');
  const allOrders = await orderRepository.findAll();
  assert(allOrders.length > 0, 'Orders should be returned');
  for (const o of allOrders) {
    assert.strictEqual(o.orderSource, undefined, `Order ${o.orderNumber} must NOT have orderSource property`);
  }
  console.log(`   ✅ All ${allOrders.length} orders in repository formatted with NO orderSource\n`);

  // 6. Analytics Verification
  console.log('6. Testing Analytics Service & Repository...');
  const analytics = await analyticsRepository.getAnalytics({ granularity: 'daily', limit: 30, piePeriod: 'year' });
  assert(analytics?.kpi, 'Analytics must return kpi');
  assert(analytics?.topProducts, 'Analytics must return topProducts');
  assert(analytics?.revenueTrend, 'Analytics must return revenueTrend');
  assert(analytics?.pieDelivery, 'Analytics must return pieDelivery');
  assert(analytics?.pieTopProducts, 'Analytics must return pieTopProducts');
  assert.strictEqual(analytics.salesBySource, undefined, 'Analytics must NOT return salesBySource');
  assert.strictEqual(analytics.pieSalesBySource, undefined, 'Analytics must NOT return pieSalesBySource');
  console.log('   ✅ Analytics query executed with 0 errors and zero order_source dependencies\n');

  console.log('=== ALL TESTS PASSED SUCCESSFULLY! ===\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
