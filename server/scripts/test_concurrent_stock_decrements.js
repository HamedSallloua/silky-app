/**
 * Automated test suite verifying race-condition safety and serialization across concurrent stock-decrement paths.
 * Usage: node server/scripts/test_concurrent_stock_decrements.js
 */
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
  orderItems,
  orderExchanges,
  exchangeItems,
  users,
} from '../models/index.js';
import * as orderService from '../services/order.service.js';
import * as exchangeService from '../services/exchange.service.js';
import { productRepository } from '../repositories/product.repository.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

let passed = 0;
let failed = 0;
let server;
let BASE = '';
let adminToken = '';

function assert(condition, message) {
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${message}`);
    failed++;
  }
}

async function request(endpoint, { method = 'GET', body, token, guestSession } = {}) {
  const headers = { 'Content-Type': 'application/json' };
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

async function runTests() {
  console.log('=== Starting Concurrent Stock Decrement Verification Tests ===\n');

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  BASE = `http://127.0.0.1:${port}/api`;
  console.log(`Test server running on ${BASE}`);

  // Admin token
  let [adminUser] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
  if (!adminUser) {
    [adminUser] = await db.insert(users).values({
      email: `admin-${Date.now()}@silky.tn`,
      passwordHash: 'fakehash',
      fullName: 'Admin Test',
      role: 'admin',
    }).returning();
  }
  adminToken = jwt.sign(
    { sub: adminUser.id, id: adminUser.id, role: adminUser.role, email: adminUser.email },
    env.jwtSecret,
    { expiresIn: '1h' }
  );


  // Category
  let [testCategory] = await db.select().from(categories).where(eq(categories.slug, 'femme')).limit(1);
  if (!testCategory) {
    [testCategory] = await db.insert(categories).values({
      name: 'Femme',
      slug: 'femme',
    }).returning();
  }

  // =========================================================================
  // SCENARIO 1: 1 unit remaining, 2 concurrent Buy Now / Direct Purchases
  // =========================================================================
  console.log('--- Scenario 1: Stock = 1, 2 concurrent Buy Now purchases ---');
  const prod1Res = await request('/products', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Produit Concurrence 1',
      description: 'Description de test 1',
      collectionImage: '/pictures/collection.jpg',
      slug: `race-prod-1-${Date.now()}`,
      price: 60,
      category: testCategory.slug,
      categoryId: testCategory.id,
      colors: [{ id: 'noir', name: 'Noir', image: '/pictures/noir.jpg' }],
      sizes: ['M'],
      stock: { 'noir-M': 1 }, // exactly 1 in stock
    },
  });

  const prod1Id = prod1Res.data?.id;
  console.log('prod1Res status:', prod1Res.status, 'data:', prod1Res.data);
  const [var1] = await db.select().from(productVariants).where(eq(productVariants.productId, prod1Id));
  assert(var1.stockQuantity === 1, `Initial stock for variant is 1`);

  // Fire 2 concurrent Buy Now requests for the same variant
  const buyPromises1 = [
    orderService.checkoutDirect({
      customer: { name: 'Acheteur A', phone: '11111111', address: 'Tunis' },
      shopper: { guestSessionId: 'aaaa1111-1111-4111-8111-111111111111' },
      item: { variantId: var1.id, quantity: 1 },
    }).then((res) => ({ success: true, res })).catch((err) => ({ success: false, err })),
    orderService.checkoutDirect({
      customer: { name: 'Acheteur B', phone: '22222222', address: 'Sousse' },
      shopper: { guestSessionId: 'bbbb2222-2222-4222-8222-222222222222' },
      item: { variantId: var1.id, quantity: 1 },
    }).then((res) => ({ success: true, res })).catch((err) => ({ success: false, err })),
  ];

  const results1 = await Promise.all(buyPromises1);
  const successes1 = results1.filter((r) => r.success);
  const failures1 = results1.filter((r) => !r.success);

  assert(successes1.length === 1, `Exactly 1 purchase succeeded (Got: ${successes1.length})`);
  assert(failures1.length === 1, `Exactly 1 purchase failed (Got: ${failures1.length})`);
  assert(failures1[0].err?.status === 400, `Failed purchase received 400 status`);
  assert(failures1[0].err?.message?.includes('stock insuffisant'), `Failed purchase received 'stock insuffisant' error`);

  const [var1Final] = await db.select().from(productVariants).where(eq(productVariants.id, var1.id));
  assert(var1Final.stockQuantity === 0, `Final stock is exactly 0 (Got: ${var1Final.stockQuantity})`);

  // =========================================================================
  // SCENARIO 2: 5 units remaining, 10 concurrent Buy Now purchases
  // =========================================================================
  console.log('\n--- Scenario 2: Stock = 5, 10 concurrent Buy Now purchases ---');
  const prod2Res = await request('/products', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Produit Concurrence 2',
      description: 'Description 2',
      collectionImage: '/pictures/collection.jpg',
      slug: `race-prod-2-${Date.now()}`,
      price: 50,
      category: testCategory.slug,
      categoryId: testCategory.id,
      colors: [{ id: 'rouge', name: 'Rouge', image: '/pictures/rouge.jpg' }],
      sizes: ['S'],
      stock: { 'rouge-S': 5 }, // 5 in stock
    },
  });

  const prod2Id = prod2Res.data?.id;
  const [var2] = await db.select().from(productVariants).where(eq(productVariants.productId, prod2Id));
  assert(var2.stockQuantity === 5, `Initial stock for variant 2 is 5`);

  const buyPromises2 = Array.from({ length: 10 }).map((_, i) =>
    orderService.checkoutDirect({
      customer: { name: `Acheteur ${i}`, phone: `5555000${i}`, address: 'Tunis' },
      shopper: { guestSessionId: `33333333-3333-4333-8333-33333333330${i}` },
      item: { variantId: var2.id, quantity: 1 },
    }).then((res) => ({ success: true, res })).catch((err) => ({ success: false, err }))
  );

  const results2 = await Promise.all(buyPromises2);
  const successes2 = results2.filter((r) => r.success);
  const failures2 = results2.filter((r) => !r.success);

  assert(successes2.length === 5, `Exactly 5 purchases succeeded out of 10 (Got: ${successes2.length})`);
  assert(failures2.length === 5, `Exactly 5 purchases failed out of 10 (Got: ${failures2.length})`);

  const [var2Final] = await db.select().from(productVariants).where(eq(productVariants.id, var2.id));
  assert(var2Final.stockQuantity === 0, `Final stock is 0 (Got: ${var2Final.stockQuantity})`);

  // =========================================================================
  // SCENARIO 3: 2 units remaining, 2 concurrent Cart checkouts for 2 units each
  // =========================================================================
  console.log('\n--- Scenario 3: Stock = 2, 2 concurrent Cart checkouts for quantity 2 ---');
  const prod3Res = await request('/products', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Produit Concurrence 3',
      description: 'Description 3',
      collectionImage: '/pictures/collection.jpg',
      slug: `race-prod-3-${Date.now()}`,
      price: 70,
      category: testCategory.slug,
      categoryId: testCategory.id,
      colors: [{ id: 'bleu', name: 'Bleu', image: '/pictures/bleu.jpg' }],
      sizes: ['L'],
      stock: { 'bleu-L': 2 }, // 2 in stock
    },
  });

  const prod3Id = prod3Res.data?.id;
  const [var3] = await db.select().from(productVariants).where(eq(productVariants.productId, prod3Id));
  assert(var3.stockQuantity === 2, `Initial stock for variant 3 is 2`);

  // Setup Cart A with 2 units
  const [cartA] = await db.insert(carts).values({ guestSessionId: '44444444-4444-4444-8444-444444444444' }).returning();
  await db.insert(cartItems).values({ cartId: cartA.id, variantId: var3.id, quantity: 2 });

  // Setup Cart B with 2 units
  const [cartB] = await db.insert(carts).values({ guestSessionId: '55555555-5555-4555-8555-555555555555' }).returning();
  await db.insert(cartItems).values({ cartId: cartB.id, variantId: var3.id, quantity: 2 });

  const cartPromises = [
    orderService.checkoutFromCart({
      customer: { name: 'Cart Shopper A', phone: '12345678', address: 'Tunis' },
      shopper: { guestSessionId: '44444444-4444-4444-8444-444444444444' },
    }).then((res) => ({ success: true, res })).catch((err) => ({ success: false, err })),
    orderService.checkoutFromCart({
      customer: { name: 'Cart Shopper B', phone: '87654321', address: 'Sfax' },
      shopper: { guestSessionId: '55555555-5555-4555-8555-555555555555' },
    }).then((res) => ({ success: true, res })).catch((err) => ({ success: false, err })),
  ];

  const cartResults = await Promise.all(cartPromises);
  const cartSuccess = cartResults.filter((r) => r.success);
  const cartFailed = cartResults.filter((r) => !r.success);

  assert(cartSuccess.length === 1, `Exactly 1 cart checkout succeeded (Got: ${cartSuccess.length})`);
  assert(cartFailed.length === 1, `Exactly 1 cart checkout failed (Got: ${cartFailed.length})`);

  const [var3Final] = await db.select().from(productVariants).where(eq(productVariants.id, var3.id));
  assert(var3Final.stockQuantity === 0, `Final stock is 0 (Got: ${var3Final.stockQuantity})`);

  // =========================================================================
  // SCENARIO 4: 3 units remaining, 2 concurrent Exchanges requesting 2 units
  // =========================================================================
  console.log('\n--- Scenario 4: Stock = 3, 2 concurrent Exchanges for 2 units each ---');
  const prod4Res = await request('/products', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Produit Concurrence 4',
      description: 'Description 4',
      collectionImage: '/pictures/collection.jpg',
      slug: `race-prod-4-${Date.now()}`,
      price: 80,
      category: testCategory.slug,
      categoryId: testCategory.id,
      colors: [
        { id: 'vert', name: 'Vert', image: '/pictures/vert.jpg' },
        { id: 'jaune', name: 'Jaune', image: '/pictures/jaune.jpg' },
      ],
      sizes: ['S'],
      stock: {
        'vert-S': 20,
        'jaune-S': 3, // Target exchange variant has 3 in stock
      },
    },
  });

  const prod4Id = prod4Res.data?.id;
  const vars4 = await db.select().from(productVariants).where(eq(productVariants.productId, prod4Id));
  const varVert = vars4.find((v) => v.colorSlug === 'vert');
  const varJaune = vars4.find((v) => v.colorSlug === 'jaune');

  // Create Order 1 (2 vert)
  const order1 = await orderService.createOrder({
    customer: { name: 'Exchange Customer 1', phone: '11223344', address: 'Tunis' },
    items: [{ variantId: varVert.id, quantity: 2 }],
  });
  await orderService.confirmOrder(order1.id);

  // Create Order 2 (2 vert)
  const order2 = await orderService.createOrder({
    customer: { name: 'Exchange Customer 2', phone: '55667788', address: 'Sousse' },
    items: [{ variantId: varVert.id, quantity: 2 }],
  });
  await orderService.confirmOrder(order2.id);

  // Both orders exchange 2 vert -> 2 jaune simultaneously (need 4 jaune, but only 3 available!)
  const exchPromises = [
    exchangeService.createExchange({
      orderId: order1.id,
      customer: { customerName: 'Exchange Customer 1', phoneNumber: '11223344', shippingAddress: 'Tunis' },
      items: [
        { variantId: varVert.id, action: 'return', quantity: 2 },
        { variantId: varJaune.id, action: 'add', quantity: 2 },
      ],
    }).then((res) => ({ success: true, res })).catch((err) => ({ success: false, err })),
    exchangeService.createExchange({
      orderId: order2.id,
      customer: { customerName: 'Exchange Customer 2', phoneNumber: '55667788', shippingAddress: 'Sousse' },
      items: [
        { variantId: varVert.id, action: 'return', quantity: 2 },
        { variantId: varJaune.id, action: 'add', quantity: 2 },
      ],
    }).then((res) => ({ success: true, res })).catch((err) => ({ success: false, err })),
  ];

  const exchResults = await Promise.all(exchPromises);
  const exchSuccess = exchResults.filter((r) => r.success);
  const exchFailed = exchResults.filter((r) => !r.success);

  assert(exchSuccess.length === 1, `Exactly 1 exchange succeeded (Got: ${exchSuccess.length})`);
  assert(exchFailed.length === 1, `Exactly 1 exchange failed due to stock (Got: ${exchFailed.length})`);

  const [varJauneFinal] = await db.select().from(productVariants).where(eq(productVariants.id, varJaune.id));
  assert(varJauneFinal.stockQuantity === 1, `Target variant stock is exactly 1 (3 - 2 = 1) (Got: ${varJauneFinal.stockQuantity})`);

  // =========================================================================
  // SCENARIO 5: Transaction Rollback on multi-item checkout error
  // =========================================================================
  console.log('\n--- Scenario 5: Transaction Rollback on multi-item checkout failure ---');
  const [varVertBefore] = await db.select().from(productVariants).where(eq(productVariants.id, varVert.id));
  const vertStockBefore = varVertBefore.stockQuantity;

  // Try to create order with item 1 (valid vert x 1) and item 2 (insufficient jaune x 999)
  let rollbackError = null;
  try {
    await orderService.createOrder({
      customer: { name: 'Rollback Tester', phone: '99999999', address: 'Tunis' },
      items: [
        { variantId: varVert.id, quantity: 1 },
        { variantId: varJaune.id, quantity: 999 }, // will fail!
      ],
    });
  } catch (err) {
    rollbackError = err;
  }

  assert(Boolean(rollbackError), `Order creation failed as expected on unavailable item`);
  const [varVertAfter] = await db.select().from(productVariants).where(eq(productVariants.id, varVert.id));
  assert(varVertAfter.stockQuantity === vertStockBefore, `First item stock was completely rolled back (Expected: ${vertStockBefore}, Got: ${varVertAfter.stockQuantity})`);

  // Cleanup
  try {
    await db.delete(cartItems).where(eq(cartItems.cartId, cartA.id));
    await db.delete(cartItems).where(eq(cartItems.cartId, cartB.id));
    await db.delete(carts).where(eq(carts.id, cartA.id));
    await db.delete(carts).where(eq(carts.id, cartB.id));
  } catch (err) {
    console.warn('Cleanup warning:', err.message);
  }

  // Summary
  console.log(`\n=== Verification Results: ${passed} passed, ${failed} failed ===`);
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  if (server) server.close();
  process.exit(1);
});
