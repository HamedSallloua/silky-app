/**
 * Comprehensive Test Suite for Phase 2 Order Integrity Safeguards
 *
 * Covers:
 * 1. Centralized quantity validation helper unit tests (NaN, Infinity, 0, negative, fractional, excessive, valid)
 * 2. Variant / product ownership validation (rejection of cross-product variant tampering)
 * 3. HTTP quantity boundary tests (0, -1, 1.5, null, MAX_ITEM_QUANTITY, MAX_ITEM_QUANTITY + 1)
 * 4. Array bounds enforcement (MAX_ORDER_ITEMS, MAX_BULK_ORDER_IDS)
 * 5. Generic status endpoint hardening (rejection of direct 'exchanged' status bypass)
 * 6. Terminal-state reversal protection (cancelled/refunded/completed/exchanged -> pending/processing)
 * 7. Refund state matrix validation (reject pending/processing/cancelled/refunded; allow completed/exchanged)
 * 8. Cancellation state matrix validation (allow pending/processing/completed/exchanged; reject cancelled/refunded)
 *
 * Usage: node server/scripts/test_order_integrity_phase2.js
 */

import crypto from 'crypto';
import http from 'http';
import { app } from '../app.js';
import { db } from '../db/orm.js';
import { eq } from 'drizzle-orm';
import {
  products,
  productVariants,
  categories,
  orders,
  users,
} from '../models/index.js';
import * as orderService from '../services/order.service.js';
import * as adminService from '../services/admin.service.js';
import * as exchangeService from '../services/exchange.service.js';
import { _resetRateLimits } from '../middleware/rateLimiter.js';
import { signAccessToken } from '../services/token.service.js';
import { runIdempotencyKeysMigration } from '../db/migrations/add_idempotency_keys.js';
import { runExchangesMigration } from '../db/migrations/add_exchanges.js';
import { runRefundsMigration } from '../db/migrations/add_refunds.js';
import { pool } from '../db/pool.js';
import {
  MAX_ITEM_QUANTITY,
  MAX_ORDER_ITEMS,
  MAX_BULK_ORDER_IDS,
  validateOrderQuantity,
} from '../config/orderLimits.js';

let passed = 0;
let failed = 0;
let server;
let BASE = '';
let adminToken = '';
let testAdminUser;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function request(endpoint, { method = 'GET', body, token, guestSession, headers: customHeaders } = {}) {
  const headers = { 'Content-Type': 'application/json', ...customHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (guestSession) headers['X-Guest-Session-ID'] = guestSession;

  const res = await fetch(`${BASE}${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { status: res.status, data, headers: res.headers };
}

async function runAllTests() {
  console.log('========================================================================');
  console.log('PHASE 2 ORDER INTEGRITY SAFEGUARDS VERIFICATION SUITE');
  console.log('========================================================================\n');

  await runIdempotencyKeysMigration(pool);
  await runExchangesMigration(pool);
  await runRefundsMigration(pool);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  BASE = `http://127.0.0.1:${port}/api`;
  console.log(`Test server running on ${BASE}\n`);

  // Setup admin user & category
  [testAdminUser] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
  if (!testAdminUser) {
    [testAdminUser] = await db.insert(users).values({
      email: `admin-p2-${Date.now()}@silky.tn`,
      passwordHash: 'fakehash',
      fullName: 'Admin Phase 2',
      role: 'admin',
    }).returning();
  }
  adminToken = signAccessToken(testAdminUser);

  let [testCategory] = await db.select().from(categories).where(eq(categories.slug, 'femme')).limit(1);
  if (!testCategory) {
    [testCategory] = await db.insert(categories).values({
      name: 'Femme',
      slug: 'femme',
    }).returning();
  }

  // Create two distinct test products
  _resetRateLimits();
  const p1Res = await request('/products', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Produit Phase 2 Alpha',
      description: 'Alpha description',
      collectionImage: '/pictures/alpha.jpg',
      slug: `p2-alpha-${Date.now()}`,
      price: 120,
      category: testCategory.slug,
      categoryId: testCategory.id,
      colors: [{ id: 'noir', name: 'Noir', image: '/pictures/noir.jpg' }],
      sizes: ['M'],
      stock: { 'noir-M': 100 },
    },
  });
  const prodA = p1Res.data;
  const [varA] = await db.select().from(productVariants).where(eq(productVariants.productId, prodA.id));

  _resetRateLimits();
  const p2Res = await request('/products', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Produit Phase 2 Beta',
      description: 'Beta description',
      collectionImage: '/pictures/beta.jpg',
      slug: `p2-beta-${Date.now()}`,
      price: 60,
      category: testCategory.slug,
      categoryId: testCategory.id,
      colors: [{ id: 'blanc', name: 'Blanc', image: '/pictures/blanc.jpg' }],
      sizes: ['S'],
      stock: { 'blanc-S': 100 },
    },
  });
  const prodB = p2Res.data;
  const [varB] = await db.select().from(productVariants).where(eq(productVariants.productId, prodB.id));

  // =========================================================================
  // SECTION 1: DIRECT QUANTITY VALIDATION HELPER UNIT TESTS
  // =========================================================================
  console.log('------------------------------------------------------------------------');
  console.log('SECTION 1: Centralized Quantity Validation Helper Unit Tests');
  console.log('------------------------------------------------------------------------');

  assert(validateOrderQuantity(1) === 1, 'Accepts exact 1');
  assert(validateOrderQuantity(50) === 50, 'Accepts exact MAX_ITEM_QUANTITY (50)');
  assert(validateOrderQuantity('10') === 10, 'Accepts integer string "10"');

  const invalidInputs = [
    { val: 0, desc: 'Zero (0)' },
    { val: -1, desc: 'Negative integer (-1)' },
    { val: -10, desc: 'Negative integer (-10)' },
    { val: 1.5, desc: 'Fractional float (1.5)' },
    { val: 0.1, desc: 'Fractional float (0.1)' },
    { val: null, desc: 'null' },
    { val: undefined, desc: 'undefined' },
    { val: true, desc: 'boolean true' },
    { val: false, desc: 'boolean false' },
    { val: NaN, desc: 'NaN' },
    { val: Infinity, desc: 'Infinity' },
    { val: -Infinity, desc: '-Infinity' },
    { val: 'abc', desc: 'Non-numeric string "abc"' },
    { val: '1.5', desc: 'Fractional string "1.5"' },
    { val: 51, desc: 'MAX_ITEM_QUANTITY + 1 (51)' },
    { val: 1000, desc: 'Excessive quantity (1000)' },
  ];

  for (const { val, desc } of invalidInputs) {
    let threw = false;
    try {
      validateOrderQuantity(val);
    } catch (err) {
      threw = true;
    }
    assert(threw, `Rejects ${desc}`);
  }

  // =========================================================================
  // SECTION 2: VARIANT / PRODUCT OWNERSHIP VALIDATION
  // =========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('SECTION 2: Variant / Product Ownership Validation');
  console.log('------------------------------------------------------------------------');

  // Test 2.1: POST /api/orders with product A ID + variant B ID -> 400 Mismatch
  _resetRateLimits();
  const [varABefore] = await db.select().from(productVariants).where(eq(productVariants.id, varA.id));
  const [varBBefore] = await db.select().from(productVariants).where(eq(productVariants.id, varB.id));

  const mismatchRes1 = await request('/orders', {
    method: 'POST',
    body: {
      customer: { name: 'Mismatch Tester', phone: '11223344', address: 'Tunis' },
      items: [{ productId: prodA.id, variantId: varB.id, quantity: 1 }],
    },
  });
  assert(mismatchRes1.status === 400, `POST /orders with mismatched product/variant rejected with 400 (Got: ${mismatchRes1.status})`);
  assert(mismatchRes1.data?.error?.includes('variante ne correspond pas'), 'Correct mismatch error message returned');

  const [varAAfterMismatch] = await db.select().from(productVariants).where(eq(productVariants.id, varA.id));
  const [varBAfterMismatch] = await db.select().from(productVariants).where(eq(productVariants.id, varB.id));
  assert(varAAfterMismatch.stockQuantity === varABefore.stockQuantity, 'Stock of product A untouched after mismatch');
  assert(varBAfterMismatch.stockQuantity === varBBefore.stockQuantity, 'Stock of product B untouched after mismatch');

  // Test 2.2: POST /api/orders/checkout (Buy Now) with product A ID + variant B ID -> 400 Mismatch
  _resetRateLimits();
  const mismatchBuyNowRes = await request('/orders/checkout', {
    method: 'POST',
    body: {
      customer: { name: 'BuyNow Mismatch', phone: '22334455', address: 'Sousse' },
      buyNowItem: { productId: prodA.id, variantId: varB.id, quantity: 1 },
    },
  });
  assert(mismatchBuyNowRes.status === 400, `Buy Now direct checkout with mismatched product/variant rejected with 400 (Got: ${mismatchBuyNowRes.status})`);
  assert(mismatchBuyNowRes.data?.error?.includes('variante ne correspond pas'), 'Correct mismatch error message returned');

  // Test 2.3: Valid matched order succeeds
  _resetRateLimits();
  const validMatchedRes = await request('/orders', {
    method: 'POST',
    body: {
      customer: { name: 'Valid Match', phone: '33445566', address: 'Sfax' },
      items: [{ productId: prodA.id, variantId: varA.id, quantity: 1 }],
    },
  });
  assert(validMatchedRes.status === 201, 'Valid matched product/variant order succeeds (201)');

  // =========================================================================
  // SECTION 3: HTTP QUANTITY BOUNDARY TESTS
  // =========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('SECTION 3: HTTP Quantity Boundary Tests');
  console.log('------------------------------------------------------------------------');

  const httpQtyTests = [
    { qty: 0, expectedStatus: 400, desc: 'Quantity 0 rejected via HTTP' },
    { qty: -1, expectedStatus: 400, desc: 'Quantity -1 rejected via HTTP' },
    { qty: 1.5, expectedStatus: 400, desc: 'Quantity 1.5 rejected via HTTP' },
    { qty: null, expectedStatus: 400, desc: 'Quantity null rejected via HTTP' },
    { qty: 51, expectedStatus: 400, desc: 'Quantity 51 (MAX + 1) rejected via HTTP' },
    { qty: 999999, expectedStatus: 400, desc: 'Extreme quantity 999999 rejected via HTTP' },
    { qty: 1, expectedStatus: 201, desc: 'Quantity 1 (exact minimum) accepted via HTTP' },
    { qty: 50, expectedStatus: 201, desc: 'Quantity 50 (exact maximum) accepted via HTTP' },
  ];

  for (const { qty, expectedStatus, desc } of httpQtyTests) {
    _resetRateLimits();
    const res = await request('/orders', {
      method: 'POST',
      body: {
        customer: { name: `Qty Test ${qty}`, phone: '44556677', address: 'Bizerte' },
        items: [{ variantId: varB.id, quantity: qty }],
      },
    });
    assert(res.status === expectedStatus, `${desc} (Status: ${res.status})`);
  }

  // =========================================================================
  // SECTION 4: ARRAY BOUNDS ENFORCEMENT
  // =========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('SECTION 4: Array Bounds Enforcement');
  console.log('------------------------------------------------------------------------');

  // Test 4.1: Items array with 51 items (MAX_ORDER_ITEMS + 1) -> 400
  _resetRateLimits();
  const oversizedItems = Array.from({ length: MAX_ORDER_ITEMS + 1 }, () => ({
    variantId: varA.id,
    quantity: 1,
  }));
  const oversizedOrderRes = await request('/orders', {
    method: 'POST',
    body: {
      customer: { name: 'Oversized Items', phone: '55667788', address: 'Tunis' },
      items: oversizedItems,
    },
  });
  assert(oversizedOrderRes.status === 400, `Order with > MAX_ORDER_ITEMS rejected with 400 (Got: ${oversizedOrderRes.status})`);
  assert(oversizedOrderRes.data?.error?.includes('Trop d\'articles'), 'Array bounds error message received');

  // Test 4.2: Bulk confirm with 101 order IDs (MAX_BULK_ORDER_IDS + 1) -> 400
  _resetRateLimits();
  const oversizedOrderIds = Array.from({ length: MAX_BULK_ORDER_IDS + 1 }, () => crypto.randomUUID());
  const oversizedBulkConfirmRes = await request('/orders/bulk-confirm', {
    method: 'POST',
    token: adminToken,
    body: { orderIds: oversizedOrderIds },
  });
  assert(oversizedBulkConfirmRes.status === 400, `Bulk confirm with > MAX_BULK_ORDER_IDS rejected with 400 (Got: ${oversizedBulkConfirmRes.status})`);

  // Test 4.3: Bulk status update with 101 order IDs (MAX_BULK_ORDER_IDS + 1) -> 400
  _resetRateLimits();
  const oversizedBulkStatusRes = await request('/orders/bulk-status', {
    method: 'PATCH',
    token: adminToken,
    body: { orderIds: oversizedOrderIds, status: 'completed' },
  });
  assert(oversizedBulkStatusRes.status === 400, `Bulk status with > MAX_BULK_ORDER_IDS rejected with 400 (Got: ${oversizedBulkStatusRes.status})`);

  // =========================================================================
  // SECTION 5: GENERIC STATUS ENDPOINT HARDENING
  // =========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('SECTION 5: Generic Status Endpoint Hardening');
  console.log('------------------------------------------------------------------------');

  // Create an order for testing status transitions
  _resetRateLimits();
  const statusTestOrderRes = await request('/orders', {
    method: 'POST',
    body: {
      customer: { name: 'Status Tester', phone: '66778899', address: 'Nabeul' },
      items: [{ variantId: varA.id, quantity: 1 }],
    },
  });
  const statusOrder = statusTestOrderRes.data;

  // Test 5.1: PATCH /api/orders/:id/status with status = 'exchanged' -> 400
  _resetRateLimits();
  const directExchangeRes = await request(`/orders/${statusOrder.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'exchanged' },
  });
  assert(directExchangeRes.status === 400, `Direct PATCH status = 'exchanged' rejected with 400 (Got: ${directExchangeRes.status})`);
  assert(directExchangeRes.data?.error?.includes('exchanged'), 'Clear error explaining dedicated exchange workflow required');

  const refreshedStatusOrder = await orderService.getOrderById(statusOrder.id);
  assert(refreshedStatusOrder.status === 'pending', 'Order status remained unchanged (pending)');
  assert(refreshedStatusOrder.exchanges.length === 0, 'No orphaned exchange records created');

  // =========================================================================
  // SECTION 6: TERMINAL-STATE REVERSAL PROTECTION
  // =========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('SECTION 6: Terminal-State Reversal Protection');
  console.log('------------------------------------------------------------------------');

  // Create and cancel an order
  _resetRateLimits();
  const cancelledOrder = await adminService.createManualOrder({
    customerName: 'Cancelled Terminal Tester',
    phoneNumber: '77889900',
    orderSource: 'phone',
    governorate: 'Tunis',
    shippingAddress: 'Rue de la Paix',
    items: [{ variantId: varA.id, quantity: 1 }],
  });
  await orderService.cancelOrder(cancelledOrder.id);

  // Test 6.1: Cancelled -> pending (rejected 400)
  _resetRateLimits();
  const cancelToPending = await request(`/orders/${cancelledOrder.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'pending' },
  });
  assert(cancelToPending.status === 400, `cancelled -> pending rejected with 400 (Got: ${cancelToPending.status})`);

  // Test 6.2: Cancelled -> processing (rejected 400)
  _resetRateLimits();
  const cancelToProcessing = await request(`/orders/${cancelledOrder.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'processing' },
  });
  assert(cancelToProcessing.status === 400, `cancelled -> processing rejected with 400 (Got: ${cancelToProcessing.status})`);

  // Test 6.3: Cancelled -> completed (rejected 400)
  _resetRateLimits();
  const cancelToCompleted = await request(`/orders/${cancelledOrder.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'completed' },
  });
  assert(cancelToCompleted.status === 400, `cancelled -> completed rejected with 400 (Got: ${cancelToCompleted.status})`);

  // Create and refund an order
  _resetRateLimits();
  const refundedOrder = await adminService.createManualOrder({
    customerName: 'Refunded Terminal Tester',
    phoneNumber: '88990011',
    orderSource: 'phone',
    governorate: 'Tunis',
    shippingAddress: 'Rue de la Paix',
    items: [{ variantId: varA.id, quantity: 1 }],
  });
  await orderService.confirmOrder(refundedOrder.id);
  await orderService.refundOrder(refundedOrder.id);

  // Test 6.4: Refunded -> pending (rejected 400)
  _resetRateLimits();
  const refundToPending = await request(`/orders/${refundedOrder.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'pending' },
  });
  assert(refundToPending.status === 400, `refunded -> pending rejected with 400 (Got: ${refundToPending.status})`);

  // Test 6.5: Refunded -> processing (rejected 400)
  _resetRateLimits();
  const refundToProcessing = await request(`/orders/${refundedOrder.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'processing' },
  });
  assert(refundToProcessing.status === 400, `refunded -> processing rejected with 400 (Got: ${refundToProcessing.status})`);

  // Test 6.6: Refunded -> completed (rejected 400)
  _resetRateLimits();
  const refundToCompleted = await request(`/orders/${refundedOrder.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'completed' },
  });
  assert(refundToCompleted.status === 400, `refunded -> completed rejected with 400 (Got: ${refundToCompleted.status})`);

  // Create and complete an order
  _resetRateLimits();
  const completedOrder = await adminService.createManualOrder({
    customerName: 'Completed Order Tester',
    phoneNumber: '99001122',
    orderSource: 'phone',
    governorate: 'Tunis',
    shippingAddress: 'Rue de la Paix',
    items: [{ variantId: varA.id, quantity: 1 }],
  });
  await orderService.confirmOrder(completedOrder.id);

  // Test 6.7: Completed -> pending (rejected 400)
  _resetRateLimits();
  const completedToPending = await request(`/orders/${completedOrder.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'pending' },
  });
  assert(completedToPending.status === 400, `completed -> pending rejected with 400 (Got: ${completedToPending.status})`);

  // Test 6.8: Completed -> processing (rejected 400)
  _resetRateLimits();
  const completedToProcessing = await request(`/orders/${completedOrder.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'processing' },
  });
  assert(completedToProcessing.status === 400, `completed -> processing rejected with 400 (Got: ${completedToProcessing.status})`);

  // Create, complete, and exchange an order
  _resetRateLimits();
  const exchangedOrder = await adminService.createManualOrder({
    customerName: 'Exchanged Order Tester',
    phoneNumber: '10111213',
    orderSource: 'phone',
    governorate: 'Tunis',
    shippingAddress: 'Rue de la Paix',
    items: [{ variantId: varA.id, quantity: 1 }],
  });
  await orderService.confirmOrder(exchangedOrder.id);
  await exchangeService.createExchange({
    orderId: exchangedOrder.id,
    customer: { customerName: 'Exchanged Order Tester', phoneNumber: '10111213', shippingAddress: 'Tunis' },
    items: [{ variantId: varB.id, action: 'add', quantity: 1 }],
  });

  // Test 6.9: Exchanged -> pending (rejected 400)
  _resetRateLimits();
  const exchangedToPending = await request(`/orders/${exchangedOrder.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'pending' },
  });
  assert(exchangedToPending.status === 400, `exchanged -> pending rejected with 400 (Got: ${exchangedToPending.status})`);

  // Test 6.10: Exchanged -> processing (rejected 400)
  _resetRateLimits();
  const exchangedToProcessing = await request(`/orders/${exchangedOrder.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'processing' },
  });
  assert(exchangedToProcessing.status === 400, `exchanged -> processing rejected with 400 (Got: ${exchangedToProcessing.status})`);

  // =========================================================================
  // SECTION 7: REFUND STATE MATRIX
  // =========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('SECTION 7: Refund State Matrix Validation');
  console.log('------------------------------------------------------------------------');

  // Test 7.1: pending -> refund = reject 400
  _resetRateLimits();
  const pendingForRefund = await adminService.createManualOrder({
    customerName: 'Pending Refund',
    phoneNumber: '20212223',
    orderSource: 'phone',
    governorate: 'Tunis',
    shippingAddress: 'Rue de la Paix',
    items: [{ variantId: varA.id, quantity: 1 }],
  });
  let rejPendingRef = false;
  try {
    await orderService.refundOrder(pendingForRefund.id);
  } catch (err) {
    rejPendingRef = err.status === 400;
  }
  assert(rejPendingRef, 'pending -> refund rejected with 400');

  // Test 7.2: processing -> refund = reject 400
  _resetRateLimits();
  const processingForRefund = await adminService.createManualOrder({
    customerName: 'Processing Refund',
    phoneNumber: '21222324',
    orderSource: 'phone',
    governorate: 'Tunis',
    shippingAddress: 'Rue de la Paix',
    items: [{ variantId: varA.id, quantity: 1 }],
  });
  await orderService.updateOrderStatus(processingForRefund.id, 'processing');
  let rejProcessingRef = false;
  try {
    await orderService.refundOrder(processingForRefund.id);
  } catch (err) {
    rejProcessingRef = err.status === 400;
  }
  assert(rejProcessingRef, 'processing -> refund rejected with 400');

  // Test 7.3: cancelled -> refund = reject 400
  _resetRateLimits();
  const cancelledForRefund = await adminService.createManualOrder({
    customerName: 'Cancelled Refund',
    phoneNumber: '22232425',
    orderSource: 'phone',
    governorate: 'Tunis',
    shippingAddress: 'Rue de la Paix',
    items: [{ variantId: varA.id, quantity: 1 }],
  });
  await orderService.cancelOrder(cancelledForRefund.id);
  let rejCancelledRef = false;
  try {
    await orderService.refundOrder(cancelledForRefund.id);
  } catch (err) {
    rejCancelledRef = err.status === 400;
  }
  assert(rejCancelledRef, 'cancelled -> refund rejected with 400');

  // Test 7.4: completed -> refund = allow 200
  _resetRateLimits();
  const completedForRefund = await adminService.createManualOrder({
    customerName: 'Completed Refund',
    phoneNumber: '23242526',
    orderSource: 'phone',
    governorate: 'Tunis',
    shippingAddress: 'Rue de la Paix',
    items: [{ variantId: varA.id, quantity: 1 }],
  });
  await orderService.confirmOrder(completedForRefund.id);
  const successRefund = await orderService.refundOrder(completedForRefund.id);
  assert(successRefund.status === 'refunded', 'completed -> refund allowed and status is refunded');

  // Test 7.5: refunded -> refund = reject 400 (duplicate refund)
  let rejDuplicateRef = false;
  try {
    await orderService.refundOrder(completedForRefund.id);
  } catch (err) {
    rejDuplicateRef = err.status === 400;
  }
  assert(rejDuplicateRef, 'refunded -> refund (duplicate) rejected with 400');

  // Test 7.6: exchanged -> refund = allow 200
  _resetRateLimits();
  const exchangedForRefund = await adminService.createManualOrder({
    customerName: 'Exchanged Refund',
    phoneNumber: '24252627',
    orderSource: 'phone',
    governorate: 'Tunis',
    shippingAddress: 'Rue de la Paix',
    items: [{ variantId: varA.id, quantity: 1 }],
  });
  await orderService.confirmOrder(exchangedForRefund.id);
  await exchangeService.createExchange({
    orderId: exchangedForRefund.id,
    customer: { customerName: 'Exchanged Refund', phoneNumber: '24252627', shippingAddress: 'Tunis' },
    items: [{ variantId: varB.id, action: 'add', quantity: 1 }],
  });
  const successExchRefund = await orderService.refundOrder(exchangedForRefund.id);
  assert(successExchRefund.status === 'refunded', 'exchanged -> refund allowed and status is refunded');

  // =========================================================================
  // SECTION 8: CANCELLATION STATE MATRIX
  // =========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('SECTION 8: Cancellation State Matrix Validation');
  console.log('------------------------------------------------------------------------');

  // Test 8.1: pending -> cancelled = allow
  _resetRateLimits();
  const pendingForCancel = await adminService.createManualOrder({
    customerName: 'Pending Cancel',
    phoneNumber: '30313233',
    orderSource: 'phone',
    governorate: 'Tunis',
    shippingAddress: 'Rue de la Paix',
    items: [{ variantId: varA.id, quantity: 1 }],
  });
  const resCancelPending = await orderService.cancelOrder(pendingForCancel.id);
  assert(resCancelPending.status === 'cancelled', 'pending -> cancelled allowed');

  // Test 8.2: processing -> cancelled = allow
  _resetRateLimits();
  const processingForCancel = await adminService.createManualOrder({
    customerName: 'Processing Cancel',
    phoneNumber: '31323334',
    orderSource: 'phone',
    governorate: 'Tunis',
    shippingAddress: 'Rue de la Paix',
    items: [{ variantId: varA.id, quantity: 1 }],
  });
  await orderService.updateOrderStatus(processingForCancel.id, 'processing');
  const resCancelProcessing = await orderService.cancelOrder(processingForCancel.id);
  assert(resCancelProcessing.status === 'cancelled', 'processing -> cancelled allowed');

  // Test 8.3: completed -> cancelled = allow
  _resetRateLimits();
  const completedForCancel = await adminService.createManualOrder({
    customerName: 'Completed Cancel',
    phoneNumber: '32333435',
    orderSource: 'phone',
    governorate: 'Tunis',
    shippingAddress: 'Rue de la Paix',
    items: [{ variantId: varA.id, quantity: 1 }],
  });
  await orderService.confirmOrder(completedForCancel.id);
  const resCancelCompleted = await orderService.cancelOrder(completedForCancel.id);
  assert(resCancelCompleted.status === 'cancelled', 'completed -> cancelled allowed');

  // Test 8.4: exchanged -> cancelled = allow
  _resetRateLimits();
  const exchangedForCancel = await adminService.createManualOrder({
    customerName: 'Exchanged Cancel',
    phoneNumber: '33343536',
    orderSource: 'phone',
    governorate: 'Tunis',
    shippingAddress: 'Rue de la Paix',
    items: [{ variantId: varA.id, quantity: 1 }],
  });
  await orderService.confirmOrder(exchangedForCancel.id);
  await exchangeService.createExchange({
    orderId: exchangedForCancel.id,
    customer: { customerName: 'Exchanged Cancel', phoneNumber: '33343536', shippingAddress: 'Tunis' },
    items: [{ variantId: varB.id, action: 'add', quantity: 1 }],
  });
  const resCancelExchanged = await orderService.cancelOrder(exchangedForCancel.id);
  assert(resCancelExchanged.status === 'cancelled', 'exchanged -> cancelled allowed');

  // Test 8.5: cancelled -> cancelled = reject 400
  let rejDuplicateCancel = false;
  try {
    await orderService.cancelOrder(pendingForCancel.id);
  } catch (err) {
    rejDuplicateCancel = err.status === 400;
  }
  assert(rejDuplicateCancel, 'cancelled -> cancelled rejected with 400');

  // Test 8.6: refunded -> cancelled = reject 400
  _resetRateLimits();
  const refundedForCancel = await adminService.createManualOrder({
    customerName: 'Refunded Cancel',
    phoneNumber: '34353637',
    orderSource: 'phone',
    governorate: 'Tunis',
    shippingAddress: 'Rue de la Paix',
    items: [{ variantId: varA.id, quantity: 1 }],
  });
  await orderService.confirmOrder(refundedForCancel.id);
  await orderService.refundOrder(refundedForCancel.id);
  let rejRefundedCancel = false;
  try {
    await orderService.cancelOrder(refundedForCancel.id);
  } catch (err) {
    rejRefundedCancel = err.status === 400;
  }
  assert(rejRefundedCancel, 'refunded -> cancelled rejected with 400');

  // Final Summary
  console.log('\n========================================================================');
  console.log(`PHASE 2 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error('Test execution error:', err);
  if (server) server.close();
  process.exit(1);
});
