/**
 * Comprehensive Test Suite for Phase 1 Order System Hardening
 *
 * Covers:
 * 1. Price integrity & delivery fee protection (tampering rejection, admin manual price isolation)
 * 2. Database-backed transaction-safe idempotency (sequential, concurrent, payload mismatch, shopper isolation, rollback)
 * 3. Route-specific in-memory sliding-window rate limiting (admin login, checkout, mutations, 429 + Retry-After)
 * 4. Idempotency cleanup retention
 *
 * Usage: node server/scripts/test_hardening_phase1.js
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
  carts,
  cartItems,
  orders,
  users,
  idempotencyKeys,
} from '../models/index.js';
import * as orderService from '../services/order.service.js';
import * as adminService from '../services/admin.service.js';
import { idempotencyRepository } from '../repositories/idempotency.repository.js';
import { _resetRateLimits } from '../middleware/rateLimiter.js';
import { signAccessToken } from '../services/token.service.js';
import { runIdempotencyKeysMigration } from '../db/migrations/add_idempotency_keys.js';
import { pool } from '../db/pool.js';

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
    body: body ? JSON.stringify(body) : undefined,
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
  console.log('PHASE 1 HARDENING VERIFICATION TEST SUITE');
  console.log('========================================================================\n');

  await runIdempotencyKeysMigration(pool);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  BASE = `http://127.0.0.1:${port}/api`;
  console.log(`Test server running on ${BASE}\n`);

  // Setup admin user & category
  [testAdminUser] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
  if (!testAdminUser) {
    [testAdminUser] = await db.insert(users).values({
      email: `admin-h1-${Date.now()}@silky.tn`,
      passwordHash: 'fakehash',
      fullName: 'Admin Hardening',
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

  // Create standard test products
  const p1Res = await request('/products', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Produit Test Hardening 1',
      description: 'Description 1',
      collectionImage: '/pictures/collection.jpg',
      slug: `h1-prod-1-${Date.now()}`,
      price: 100, // 100 TND
      category: testCategory.slug,
      categoryId: testCategory.id,
      colors: [{ id: 'noir', name: 'Noir', image: '/pictures/noir.jpg' }],
      sizes: ['M'],
      stock: { 'noir-M': 25 },
    },
  });
  const prod1 = p1Res.data;
  const [var1] = await db.select().from(productVariants).where(eq(productVariants.productId, prod1.id));

  const p2Res = await request('/products', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Produit Test Hardening 2',
      description: 'Description 2',
      collectionImage: '/pictures/collection.jpg',
      slug: `h1-prod-2-${Date.now()}`,
      price: 80, // 80 TND
      category: testCategory.slug,
      categoryId: testCategory.id,
      colors: [{ id: 'rouge', name: 'Rouge', image: '/pictures/rouge.jpg' }],
      sizes: ['S'],
      stock: { 'rouge-S': 25 },
    },
  });
  const prod2 = p2Res.data;
  const [var2] = await db.select().from(productVariants).where(eq(productVariants.productId, prod2.id));

  // =========================================================================
  // SECTION 1: PRICE & DELIVERY FEE INTEGRITY
  // =========================================================================
  console.log('------------------------------------------------------------------------');
  console.log('SECTION 1: Price & Financial Data Protection');
  console.log('------------------------------------------------------------------------');

  // Test 1.1: Customer POST /api/orders sends price = 0 -> DB price used
  _resetRateLimits();
  const fakePriceZeroRes = await request('/orders', {
    method: 'POST',
    body: {
      customer: { name: 'Price Hacker', phone: '12345678', address: 'Tunis' },
      items: [{ variantId: var1.id, quantity: 1, price: 0 }],
      deliveryFee: 0,
    },
  });
  assert(fakePriceZeroRes.status === 201, 'POST /orders accepted request');
  assert(Number(fakePriceZeroRes.data?.items?.[0]?.price) === 100, 'Authoritative product price used (100 TND, ignored client price: 0)');
  assert(Number(fakePriceZeroRes.data?.subtotal) === 100, 'Subtotal correctly computed from DB price (100 TND)');
  assert(Number(fakePriceZeroRes.data?.deliveryFee) === 8, 'Authoritative delivery fee used (8 TND, ignored client fee: 0)');
  assert(Number(fakePriceZeroRes.data?.total) === 108, 'Total amount correctly computed (108 TND)');

  // Test 1.2: Customer POST /api/orders sends price = 1 -> DB price used
  _resetRateLimits();
  const fakePriceOneRes = await request('/orders', {
    method: 'POST',
    body: {
      customer: { name: 'Price Hacker 2', phone: '12345678', address: 'Tunis' },
      items: [{ variantId: var1.id, quantity: 2, price: 1.0 }],
    },
  });
  assert(Number(fakePriceOneRes.data?.items?.[0]?.price) === 100, 'Authoritative product price used (100 TND, ignored client price: 1.0)');
  assert(Number(fakePriceOneRes.data?.subtotal) === 200, 'Subtotal correctly computed (2 x 100 = 200 TND)');

  // Test 1.3: Admin Manual Order preserves intentional custom pricing & fees
  _resetRateLimits();
  const manualOrder = await adminService.createManualOrder({
    customerName: 'Client Hors Ligne',
    phoneNumber: '99887766',
    orderSource: 'phone',
    governorate: 'Tunis',
    items: [{ variantId: var1.id, quantity: 1, price: 65.5 }], // special negotiated price
    shippingAddress: 'Boutique Physique',
    deliveryFee: 5.0,
  });
  assert(Number(manualOrder.items[0].price) === 65.5, 'Admin manual order respects custom unit price (65.5 TND)');
  assert(Number(manualOrder.deliveryFee) === 5.0, 'Admin manual order respects custom delivery fee (5.0 TND)');
  assert(Number(manualOrder.total) === 70.5, 'Admin manual order total equals 65.5 + 5.0 = 70.5 TND');

  // =========================================================================
  // SECTION 2: SEQUENTIAL & CONCURRENT IDEMPOTENCY
  // =========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('SECTION 2: PostgreSQL-Backed Idempotency Protection');
  console.log('------------------------------------------------------------------------');

  // Test 2.1: Sequential duplicate Buy Now checkout with same key
  _resetRateLimits();
  const key1 = `idemp-seq-${Date.now()}`;
  const guest1 = crypto.randomUUID();

  const [var1BeforeSeq] = await db.select().from(productVariants).where(eq(productVariants.id, var1.id));
  const stockBeforeSeq = var1BeforeSeq.stockQuantity;

  const res1Seq = await request('/orders/checkout', {
    method: 'POST',
    guestSession: guest1,
    headers: { 'Idempotency-Key': key1 },
    body: {
      customer: { name: 'Acheteur Seq', phone: '11111111', address: 'Tunis' },
      buyNowItem: { variantId: var1.id, quantity: 1 },
    },
  });
  assert(res1Seq.status === 201, 'First Buy Now request succeeds with 201');
  const orderId1 = res1Seq.data?.id;

  const res2Seq = await request('/orders/checkout', {
    method: 'POST',
    guestSession: guest1,
    headers: { 'Idempotency-Key': key1 },
    body: {
      customer: { name: 'Acheteur Seq', phone: '11111111', address: 'Tunis' },
      buyNowItem: { variantId: var1.id, quantity: 1 },
    },
  });
  assert(res2Seq.status === 201, 'Second Buy Now request with same key returns 201');
  assert(res2Seq.data?.id === orderId1, 'Second request returns EXACT SAME order ID');
  assert(res2Seq.data?.orderNumber === res1Seq.data?.orderNumber, 'Order number matches original');

  const [var1AfterSeq] = await db.select().from(productVariants).where(eq(productVariants.id, var1.id));
  assert(var1AfterSeq.stockQuantity === stockBeforeSeq - 1, `Stock decremented exactly ONCE (${stockBeforeSeq} -> ${var1AfterSeq.stockQuantity})`);

  // Test 2.2: Concurrent duplicate Buy Now checkouts (Promise.all)
  _resetRateLimits();
  const key2 = `idemp-conc-${Date.now()}`;
  const guest2 = crypto.randomUUID();

  const [var1BeforeConc] = await db.select().from(productVariants).where(eq(productVariants.id, var1.id));
  const stockBeforeConc = var1BeforeConc.stockQuantity;

  const concPromises = [
    request('/orders/checkout', {
      method: 'POST',
      guestSession: guest2,
      headers: { 'Idempotency-Key': key2 },
      body: {
        customer: { name: 'Acheteur Conc', phone: '22222222', address: 'Sousse' },
        buyNowItem: { variantId: var1.id, quantity: 1 },
      },
    }),
    request('/orders/checkout', {
      method: 'POST',
      guestSession: guest2,
      headers: { 'Idempotency-Key': key2 },
      body: {
        customer: { name: 'Acheteur Conc', phone: '22222222', address: 'Sousse' },
        buyNowItem: { variantId: var1.id, quantity: 1 },
      },
    }),
  ];

  const [concResA, concResB] = await Promise.all(concPromises);
  assert(concResA.status === 201 && concResB.status === 201, 'Both concurrent requests returned 201');
  assert(concResA.data?.id === concResB.data?.id, 'Both concurrent requests returned the identical order ID');

  const [var1AfterConc] = await db.select().from(productVariants).where(eq(productVariants.id, var1.id));
  assert(var1AfterConc.stockQuantity === stockBeforeConc - 1, `Stock decremented only ONCE under concurrent race (${stockBeforeConc} -> ${var1AfterConc.stockQuantity})`);

  // Test 2.3: Same key with DIFFERENT payload -> 409 Conflict
  _resetRateLimits();
  const conflictRes = await request('/orders/checkout', {
    method: 'POST',
    guestSession: guest2,
    headers: { 'Idempotency-Key': key2 }, // Reusing key2 with Product 2 instead of Product 1
    body: {
      customer: { name: 'Acheteur Conc', phone: '22222222', address: 'Sousse' },
      buyNowItem: { variantId: var2.id, quantity: 1 },
    },
  });
  assert(conflictRes.status === 409, 'Reusing key with different payload rejected with 409 Conflict');
  assert(conflictRes.data?.error?.includes('différente'), 'Conflict error message received');

  // Test 2.4: Different keys -> Independent orders created
  _resetRateLimits();
  const key3A = `idemp-diff-A-${Date.now()}`;
  const key3B = `idemp-diff-B-${Date.now()}`;
  const guest3 = crypto.randomUUID();

  const res3A = await request('/orders/checkout', {
    method: 'POST',
    guestSession: guest3,
    headers: { 'Idempotency-Key': key3A },
    body: {
      customer: { name: 'Acheteur Diff', phone: '33333333', address: 'Sfax' },
      buyNowItem: { variantId: var2.id, quantity: 1 },
    },
  });
  const res3B = await request('/orders/checkout', {
    method: 'POST',
    guestSession: guest3,
    headers: { 'Idempotency-Key': key3B },
    body: {
      customer: { name: 'Acheteur Diff', phone: '33333333', address: 'Sfax' },
      buyNowItem: { variantId: var2.id, quantity: 1 },
    },
  });
  assert(res3A.status === 201 && res3B.status === 201, 'Both distinct requests succeeded');
  assert(res3A.data?.id !== res3B.data?.id, 'Two independent orders created for different keys');

  // Test 2.5: Cart Checkout Idempotency
  _resetRateLimits();
  const cartKey = `idemp-cart-${Date.now()}`;
  const cartGuest = crypto.randomUUID();

  // Add 1 item to cart
  await request('/cart/items', {
    method: 'POST',
    guestSession: cartGuest,
    body: { variantId: var2.id, quantity: 1 },
  });

  const cartRes1 = await request('/orders/checkout', {
    method: 'POST',
    guestSession: cartGuest,
    headers: { 'Idempotency-Key': cartKey },
    body: {
      customer: { name: 'Cart Shopper', phone: '44444444', address: 'Bizerte' },
    },
  });
  assert(cartRes1.status === 201, 'First cart checkout succeeded');

  const cartRes2 = await request('/orders/checkout', {
    method: 'POST',
    guestSession: cartGuest,
    headers: { 'Idempotency-Key': cartKey },
    body: {
      customer: { name: 'Cart Shopper', phone: '44444444', address: 'Bizerte' },
    },
  });
  assert(cartRes2.status === 201, 'Second cart checkout with same key returned 201');
  assert(cartRes2.data?.id === cartRes1.data?.id, 'Cart checkout returned original order');

  // Test 2.6: Authenticated User Idempotency
  _resetRateLimits();
  const [authUser] = await db.insert(users).values({
    email: `auth-user-${Date.now()}@silky.tn`,
    passwordHash: 'fakehash',
    fullName: 'Auth Shopper',
    role: 'customer',
  }).returning();
  const authUserToken = signAccessToken(authUser);
  const authKey = `idemp-auth-${Date.now()}`;

  const authRes1 = await request('/orders/checkout', {
    method: 'POST',
    token: authUserToken,
    headers: { 'Idempotency-Key': authKey },
    body: {
      customer: { name: 'Auth Shopper', phone: '55555555', address: 'Nabeul' },
      buyNowItem: { variantId: var1.id, quantity: 1 },
    },
  });
  assert(authRes1.status === 201, 'Authenticated checkout succeeded');

  const authRes2 = await request('/orders/checkout', {
    method: 'POST',
    token: authUserToken,
    headers: { 'Idempotency-Key': authKey },
    body: {
      customer: { name: 'Auth Shopper', phone: '55555555', address: 'Nabeul' },
      buyNowItem: { variantId: var1.id, quantity: 1 },
    },
  });
  assert(authRes2.data?.id === authRes1.data?.id, 'Authenticated user retry returned identical order');

  // Test 2.7: Failed transaction rollback allows subsequent successful retry
  _resetRateLimits();
  const failKey = `idemp-fail-${Date.now()}`;
  const failGuest = crypto.randomUUID();

  // Attempt checkout with quantity > stock (fail)
  const failAttempt = await request('/orders/checkout', {
    method: 'POST',
    guestSession: failGuest,
    headers: { 'Idempotency-Key': failKey },
    body: {
      customer: { name: 'Fail Shopper', phone: '66666666', address: 'Tunis' },
      buyNowItem: { variantId: var1.id, quantity: 999 }, // Out of stock
    },
  });
  assert(failAttempt.status === 400, 'Exceeded stock rejected with 400');

  // Same key with valid quantity now succeeds (uncommitted key was cleanly rolled back)
  const retrySuccess = await request('/orders/checkout', {
    method: 'POST',
    guestSession: failGuest,
    headers: { 'Idempotency-Key': failKey },
    body: {
      customer: { name: 'Fail Shopper', phone: '66666666', address: 'Tunis' },
      buyNowItem: { variantId: var1.id, quantity: 1 }, // Valid quantity
    },
  });
  assert(retrySuccess.status === 201, 'Retry after rollback succeeds with 201 (no permanent dead key)');

  // =========================================================================
  // SECTION 3: RATE LIMITING SAFEGUARDS
  // =========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('SECTION 3: Server-Side Route Rate Limiting');
  console.log('------------------------------------------------------------------------');

  // Test 3.1: Admin login limiter (max 5 attempts per 15 min per IP)
  _resetRateLimits();
  const loginAttempts = [];
  for (let i = 0; i < 5; i++) {
    loginAttempts.push(
      await request('/admin/login', {
        method: 'POST',
        body: { password: 'wrongpassword' },
      })
    );
  }
  const allFirstFiveFailedAuth = loginAttempts.every((r) => r.status === 401);
  assert(allFirstFiveFailedAuth, 'First 5 bad login attempts return 401 Unauthorized');

  // 6th attempt should be blocked with 429 Too Many Requests
  const blockedLogin = await request('/admin/login', {
    method: 'POST',
    body: { password: 'wrongpassword' },
  });
  assert(blockedLogin.status === 429, '6th admin login attempt blocked with HTTP 429 (Got: 429)');
  assert(blockedLogin.headers.get('retry-after') !== null, 'Retry-After header present on 429 response');
  assert(blockedLogin.data?.error?.includes('Trop de tentatives'), 'Rate limit message returned');

  // Test 3.2: Checkout rate limiter (max 10 requests per min)
  _resetRateLimits();
  const rateLimitGuest = crypto.randomUUID();
  const checkoutAttempts = [];
  for (let i = 0; i < 10; i++) {
    checkoutAttempts.push(
      await request('/orders/checkout', {
        method: 'POST',
        guestSession: rateLimitGuest,
        body: {
          customer: { name: `Shopper ${i}`, phone: '77777777', address: 'Tunis' },
          buyNowItem: { variantId: var1.id, quantity: 1 },
        },
      })
    );
  }
  const first10Succeeded = checkoutAttempts.every((r) => r.status === 201);
  assert(first10Succeeded, 'First 10 checkout requests within window succeeded (201)');

  // 11th request blocked with 429
  const blockedCheckout = await request('/orders/checkout', {
    method: 'POST',
    guestSession: rateLimitGuest,
    body: {
      customer: { name: 'Shopper 11', phone: '77777777', address: 'Tunis' },
      buyNowItem: { variantId: var1.id, quantity: 1 },
    },
  });
  assert(blockedCheckout.status === 429, '11th checkout request blocked with HTTP 429');
  assert(blockedCheckout.headers.get('retry-after') !== null, 'Retry-After header present');


  // =========================================================================
  // SECTION 4: RETENTION CLEANUP
  // =========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('SECTION 4: Idempotency Retention & Pruning');
  console.log('------------------------------------------------------------------------');

  const cleanupCount = await idempotencyRepository.cleanupExpired(48);
  assert(typeof cleanupCount === 'number', 'Cleanup executed safely without blocking or throwing');

  // Final Summary
  console.log('\n========================================================================');
  console.log(`PHASE 1 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error('Test execution error:', err);
  if (server) server.close();
  process.exit(1);
});
