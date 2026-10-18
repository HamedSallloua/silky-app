/**
 * Test suite for Buy Now Direct Purchase flow.
 * Usage: node server/scripts/test_buy_now.js
 */
import crypto from 'crypto';
import http from 'http';
import { app } from '../app.js';
import * as inventoryService from '../services/inventory.service.js';
import { productRepository } from '../repositories/product.repository.js';

let passed = 0;
let failed = 0;
let server;
let BASE = '';

function assert(condition, message) {
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${message}`);
    failed++;
  }
}

async function request(endpoint, { method = 'GET', body, token, guestSession, cookieJar } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (guestSession) headers['X-Guest-Session-ID'] = guestSession;
  if (cookieJar?.cookie) headers.Cookie = cookieJar.cookie;
  if (cookieJar?.guestSessionId) headers['X-Guest-Session-ID'] = cookieJar.guestSessionId;

  const res = await fetch(`${BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const setCookie = res.headers.get('set-cookie');
  const guestHeader = res.headers.get('x-guest-session-id');
  if (cookieJar) {
    if (setCookie) {
      const match = setCookie.match(/silky_guest_session=([^;]+)/);
      if (match) cookieJar.cookie = `silky_guest_session=${match[1]}`;
    }
    if (guestHeader) cookieJar.guestSessionId = guestHeader;
  }

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
  console.log('=== Starting Buy Now Flow Verification Tests ===\n');

  // Start ephemeral test server
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      BASE = `http://127.0.0.1:${port}/api`;
      console.log(`Test server running on ${BASE}`);
      resolve();
    });
  });

  try {
    // Fetch available products
    const prodsRes = await request('/products');
    assert(prodsRes.status === 200 && Array.isArray(prodsRes.data), 'Fetch products list');

    const product1 = prodsRes.data.find((p) => p.colors?.length && p.sizes?.length && p.stock);
    assert(Boolean(product1), `Found test product 1: ${product1?.name}`);

    const color1 = product1.colors[0].id;
    const size1 = product1.sizes[0];
    const stockKey1 = `${color1}-${size1}`;

    const var1 = await productRepository.findVariantForOrderItem(product1.id, color1, size1);
    if (var1) {
      await inventoryService.updateVariantStock(var1.id, 20);
    }

    const initialStock1 = 20;
    console.log(`Initial stock for ${product1.name} (${color1}/${size1}): ${initialStock1}`);

    // -------------------------------------------------------------
    // Test 1: Guest Buy Now (Empty cart -> Buy Now -> Checkout)
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Guest Buy Now ---');
    const guestJar = { cookie: null, guestSessionId: crypto.randomUUID() };

    // Verify guest cart is empty
    const guestCartBefore = await request('/cart', { cookieJar: guestJar });
    assert(guestCartBefore.status === 200 && guestCartBefore.data?.items?.length === 0, 'Guest cart initially empty');

    // Perform Buy Now checkout
    const buyNowPayload1 = {
      customer: {
        firstName: 'Guest',
        lastName: 'Shopper',
        phone: '98765432',
        address: 'Tunis — Avenue Habib Bourguiba',
      },
      buyNowItem: {
        productId: product1.id,
        colorId: color1,
        size: size1,
        quantity: 1,
      },
    };

    const buyNowRes1 = await request('/orders/checkout', {
      method: 'POST',
      body: buyNowPayload1,
      cookieJar: guestJar,
    });

    assert(buyNowRes1.status === 201, `Guest Buy Now status 201 (Got: ${buyNowRes1.status})`);
    assert(Boolean(buyNowRes1.data?.orderNumber), `Order created: ${buyNowRes1.data?.orderNumber}`);
    assert(buyNowRes1.data?.items?.length === 1, 'Order has exactly 1 item');
    assert(buyNowRes1.data?.items?.[0]?.name === product1.name, 'Order item product name matches');

    // Check guest cart is STILL empty and untouched
    const guestCartAfter = await request('/cart', { cookieJar: guestJar });
    assert(guestCartAfter.data?.items?.length === 0, 'Guest cart remains empty after Buy Now');

    // Check stock decreased by 1
    const prod1After = await request(`/products/${product1.id}`);
    const newStock1 = prod1After.data?.stock?.[stockKey1];
    assert(newStock1 === initialStock1 - 1, `Stock decremented from ${initialStock1} to ${newStock1}`);

    // -------------------------------------------------------------
    // Test 2: Authenticated Customer Buy Now
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Authenticated Customer Buy Now ---');
    const authEmail = `buynow-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@test.silky.tn`;
    const authPhone = '5' + Math.floor(1000000 + Math.random() * 8999999).toString().slice(0, 7);
    const registerRes = await request('/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Auth User',
        email: authEmail,
        phoneNumber: authPhone,
        password: 'Password123!',
      },
    });

    assert(registerRes.status === 201 && Boolean(registerRes.data?.token), 'Registered authenticated user');
    const userToken = registerRes.data?.token;

    const authBuyNowRes = await request('/orders/checkout', {
      method: 'POST',
      body: {
        customer: {
          firstName: 'Auth',
          lastName: 'User',
          email: authEmail,
          phone: authPhone,
          address: 'Sousse — Boulevard 14 Janvier',
        },
        buyNowItem: {
          productId: product1.id,
          colorId: color1,
          size: size1,
          quantity: 1,
        },
      },
      token: userToken,
    });

    assert(authBuyNowRes.status === 201, 'Authenticated user Buy Now succeeds with 201');
    assert(authBuyNowRes.data?.userId === registerRes.data?.user?.id, 'Order linked to user ID');

    // -------------------------------------------------------------
    // Test 3: Persistent Cart Isolation
    // (User has existing items in cart, performs Buy Now -> cart is UNCHANGED)
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Persistent Cart Isolation ---');
    const isolationJar = { cookie: null, guestSessionId: crypto.randomUUID() };

    // Add product1 to cart
    const addRes1 = await request('/cart/items', {
      method: 'POST',
      body: {
        productId: product1.id,
        colorId: color1,
        size: size1,
        quantity: 1,
      },
      cookieJar: isolationJar,
    });
    assert(addRes1.status === 201 && addRes1.data?.items?.length === 1, 'Item added to persistent cart');

    // Find another product if available
    const product2 = prodsRes.data.find((p) => p.id !== product1.id && p.colors?.length && p.sizes?.length) || product1;
    const color2 = product2.colors[0].id;
    const size2 = product2.sizes[0];
    const var2 = await productRepository.findVariantForOrderItem(product2.id, color2, size2);
    if (var2) {
      await inventoryService.updateVariantStock(var2.id, 20);
    }

    // Perform Buy Now on product2
    const buyNowIsolationRes = await request('/orders/checkout', {
      method: 'POST',
      body: {
        customer: {
          firstName: 'Isolated',
          lastName: 'Shopper',
          phone: '11223344',
          address: 'Nabeul — Avenue Habib Bourguiba',
        },
        buyNowItem: {
          productId: product2.id,
          colorId: color2,
          size: size2,
          quantity: 1,
        },
      },
      cookieJar: isolationJar,
    });

    assert(buyNowIsolationRes.status === 201, 'Buy Now on Product 2 succeeds');
    assert(buyNowIsolationRes.data?.items?.[0]?.name === product2.name, 'Buy Now order contains Product 2');

    // Verify persistent cart still contains Product 1 unaltered!
    const cartCheck = await request('/cart', { cookieJar: isolationJar });
    assert(cartCheck.data?.items?.length === 1, 'Persistent cart STILL contains 1 item');
    assert(cartCheck.data?.items?.[0]?.productId === product1.id, 'Persistent cart item is Product 1 (unmodified)');
    assert(cartCheck.data?.items?.[0]?.quantity === 1, 'Persistent cart quantity untouched (quantity = 1)');

    // -------------------------------------------------------------
    // Test 4: Prevention of Client Price/Discount Tampering
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Price & Financial Data Tampering Prevention ---');
    const tamperJar = { cookie: null, guestSessionId: crypto.randomUUID() };

    const tamperRes = await request('/orders/checkout', {
      method: 'POST',
      body: {
        customer: {
          firstName: 'Tamper',
          lastName: 'Attempt',
          phone: '99887766',
          address: 'Bizerte — Rue de la Corniche',
        },
        buyNowItem: {
          productId: product1.id,
          colorId: color1,
          size: size1,
          quantity: 1,
          price: 0.01, // Attempted fake unit price
          discount: 999, // Attempted fake discount
          deliveryFee: 0, // Attempted fake delivery fee
        },
      },
      cookieJar: tamperJar,
    });

    assert(tamperRes.status === 201, 'Order placed successfully');
    const expectedUnitPrice = parseFloat(product1.price) - parseFloat(product1.discount || 0);
    const orderUnitPrice = parseFloat(tamperRes.data?.items?.[0]?.price);
    assert(orderUnitPrice === expectedUnitPrice, `Authoritative DB price charged (${orderUnitPrice} TND vs expected ${expectedUnitPrice} TND, ignored client fake price 0.01)`);
    assert(parseFloat(tamperRes.data?.deliveryFee) >= 0, `Configured delivery fee charged: ${tamperRes.data?.deliveryFee} TND`);

    // -------------------------------------------------------------
    // Test 5: Insufficient Stock Handling
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Insufficient Stock Prevention ---');
    const overStockRes = await request('/orders/checkout', {
      method: 'POST',
      body: {
        customer: {
          firstName: 'Over',
          lastName: 'Stock',
          phone: '99887766',
          address: 'Gabes — Route de Tunis',
        },
        buyNowItem: {
          productId: product1.id,
          colorId: color1,
          size: size1,
          quantity: 25,
        },
      },
    });

    assert(overStockRes.status === 400, `Excessive quantity rejected with status 400 (Got: ${overStockRes.status})`);
    assert(overStockRes.data?.error?.includes('stock insuffisant'), `Error message indicates insufficient stock: "${overStockRes.data?.error}"`);

    // -------------------------------------------------------------
    // Test 6: Normal Cart Checkout Flow Remains Functional & Clears Cart
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Normal Cart Checkout Clears Cart ---');
    // isolationJar still has Product 1 in cart
    const normalCheckoutRes = await request('/orders/checkout', {
      method: 'POST',
      body: {
        customer: {
          firstName: 'Normal',
          lastName: 'Checkout',
          phone: '11223344',
          address: 'Nabeul — Avenue Habib Bourguiba',
        },
      },
      cookieJar: isolationJar,
    });

    assert(normalCheckoutRes.status === 201, 'Normal cart checkout succeeds with 201');
    const cartAfterNormal = await request('/cart', { cookieJar: isolationJar });
    assert(cartAfterNormal.data?.items?.length === 0, 'Normal cart checkout cleared persistent cart as expected');

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log(`\n=== Verification Results: ${passed} passed, ${failed} failed ===`);
  } finally {
    if (server) {
      server.close();
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  if (server) server.close();
  process.exit(1);
});
