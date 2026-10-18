/**
 * Automated Verification Suite: Direct Order Customer Input Validation
 * Tests phone, name, email, and address validation across all order creation endpoints
 * and direct service calls. Verifies zero database persistence on invalid inputs
 * and guarantees preservation of financial and stock invariants.
 *
 * Usage: node server/scripts/test_order_customer_validation.js
 */
import assert from 'assert';
import http from 'http';
import crypto from 'crypto';
import { app } from '../app.js';
import { db } from '../db/orm.js';
import { orders } from '../models/index.js';
import { eq, sql } from 'drizzle-orm';
import { extractCustomerInfo } from '../services/order.service.js';
import { productRepository } from '../repositories/product.repository.js';
import * as inventoryService from '../services/inventory.service.js';

let passed = 0;
let failed = 0;
let server;
let BASE = '';

function pass(name) {
  console.log(`  ✓ ${name}`);
  passed++;
}

function fail(name, err) {
  console.error(`  ✗ ${name}`);
  console.error(`    ${err?.message || err}`);
  failed++;
}

function test(name, fn) {
  try {
    fn();
    pass(name);
  } catch (err) {
    fail(name, err);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (err) {
    fail(name, err);
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

async function getOrderCount() {
  const [result] = await db.select({ count: sql`count(*)::int` }).from(orders);
  return result.count;
}

async function runAllTests() {
  console.log('\n=============================================================');
  console.log('--- SILKY DIRECT ORDER CUSTOMER INPUT VALIDATION SUITE ---');
  console.log('=============================================================\n');

  // Start ephemeral HTTP server
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      BASE = `http://127.0.0.1:${port}/api`;
      console.log(`Ephemeral test server listening on ${BASE}\n`);
      resolve();
    });
  });

  try {
    // -------------------------------------------------------------
    // SECTION 1: UNIT VALIDATION - extractCustomerInfo
    // -------------------------------------------------------------
    console.log('--- 1. UNIT VALIDATION: extractCustomerInfo ---');

    test('Rejects null, undefined, or non-object customer', () => {
      assert.throws(() => extractCustomerInfo(null), /Les informations client sont requises/);
      assert.throws(() => extractCustomerInfo(undefined), /Les informations client sont requises/);
      assert.throws(() => extractCustomerInfo('invalid'), /Les informations client sont requises/);
      assert.throws(() => extractCustomerInfo([]), /Les informations client sont requises/);
    });

    test('Phone: rejects missing or empty phone number', () => {
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', address: 'Tunis' }), /numéro de téléphone est obligatoire/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '', address: 'Tunis' }), /numéro de téléphone est obligatoire/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '   ', address: 'Tunis' }), /numéro de téléphone est obligatoire/);
    });

    test('Phone: rejects non-string phone types', () => {
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: 12345678, address: 'Tunis' }), /exactement 8 chiffres/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: {}, address: 'Tunis' }), /exactement 8 chiffres/);
    });

    test('Phone: rejects invalid lengths (< 8 or > 8 digits)', () => {
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '1234567', address: 'Tunis' }), /exactement 8 chiffres/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '123456789', address: 'Tunis' }), /exactement 8 chiffres/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '12', address: 'Tunis' }), /exactement 8 chiffres/);
    });

    test('Phone: rejects letters, symbols, spaces, and international prefix', () => {
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: 'abcdefgh', address: 'Tunis' }), /exactement 8 chiffres/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '1234abcd', address: 'Tunis' }), /exactement 8 chiffres/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '12-34-56', address: 'Tunis' }), /exactement 8 chiffres/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '+21612345678', address: 'Tunis' }), /exactement 8 chiffres/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '12 34 56 78', address: 'Tunis' }), /exactement 8 chiffres/);
    });

    test('Phone: accepts strictly 8 digits', () => {
      const res = extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: 'Tunis', governorate: 'Tunis' });
      assert.strictEqual(res.phone, '98765432');
    });

    test('Name (single): rejects missing or empty name', () => {
      assert.throws(() => extractCustomerInfo({ phone: '98765432', address: 'Tunis', governorate: 'Tunis' }), /nom du client est obligatoire/);
      assert.throws(() => extractCustomerInfo({ name: '', phone: '98765432', address: 'Tunis', governorate: 'Tunis' }), /nom du client est obligatoire/);
      assert.throws(() => extractCustomerInfo({ name: '   ', phone: '98765432', address: 'Tunis', governorate: 'Tunis' }), /nom du client est obligatoire/);
    });

    test('Name (single): rejects short (< 3 chars) and long (> 35 chars) names', () => {
      assert.throws(() => extractCustomerInfo({ name: 'Al', phone: '98765432', address: 'Tunis', governorate: 'Tunis' }), /au moins 3 lettres/);
      assert.throws(() => extractCustomerInfo({ name: 'A'.repeat(36), phone: '98765432', address: 'Tunis', governorate: 'Tunis' }), /ne doit pas dépasser 35 lettres/);
    });

    test('Name (single): rejects non-letter characters, numbers, and symbols', () => {
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed123', phone: '98765432', address: 'Tunis', governorate: 'Tunis' }), /uniquement des lettres/);
      assert.throws(() => extractCustomerInfo({ name: '<script>alert(1)</script>', phone: '98765432', address: 'Tunis', governorate: 'Tunis' }), /uniquement des lettres/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed@Silky', phone: '98765432', address: 'Tunis', governorate: 'Tunis' }), /uniquement des lettres/);
    });

    test('Name (single): accepts valid names with letters, French accents, spaces, hyphens, and apostrophes', () => {
      const n1 = extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: 'Rue 123', governorate: 'Tunis' });
      assert.strictEqual(n1.name, 'Ahmed Ben Ali');

      const n2 = extractCustomerInfo({ name: "Jean-Luc D'Arras", phone: '98765432', address: 'Rue 123', governorate: 'Tunis' });
      assert.strictEqual(n2.name, "Jean-Luc D'Arras");

      const n3 = extractCustomerInfo({ name: 'Chahrazède Élodie', phone: '98765432', address: 'Rue 123', governorate: 'Tunis' });
      assert.strictEqual(n3.name, 'Chahrazède Élodie');
    });

    test('Name (composite): validates firstName and lastName individually', () => {
      // Missing firstName
      assert.throws(() => extractCustomerInfo({ lastName: 'Ben Ali', phone: '98765432', address: 'Tunis', governorate: 'Tunis' }), /prénom est obligatoire/);
      // Missing lastName
      assert.throws(() => extractCustomerInfo({ firstName: 'Ahmed', phone: '98765432', address: 'Tunis', governorate: 'Tunis' }), /nom de famille est obligatoire/);
      // Short firstName
      assert.throws(() => extractCustomerInfo({ firstName: 'Al', lastName: 'Ben Ali', phone: '98765432', address: 'Tunis', governorate: 'Tunis' }), /prénom doit contenir au moins 3 lettres/);
      // Short lastName
      assert.throws(() => extractCustomerInfo({ firstName: 'Ahmed', lastName: 'Bo', phone: '98765432', address: 'Tunis', governorate: 'Tunis' }), /nom de famille doit contenir au moins 3 lettres/);
      // Non-letters
      assert.throws(() => extractCustomerInfo({ firstName: 'Ahmed99', lastName: 'Ben Ali', phone: '98765432', address: 'Tunis', governorate: 'Tunis' }), /prénom doit contenir uniquement des lettres/);
      assert.throws(() => extractCustomerInfo({ firstName: 'Ahmed', lastName: 'Ben Ali #1', phone: '98765432', address: 'Tunis', governorate: 'Tunis' }), /nom de famille doit contenir uniquement des lettres/);

      // Valid composite
      const res = extractCustomerInfo({ firstName: 'Sarra', lastName: 'Ben Mansour', phone: '98765432', address: 'Rue 123', governorate: 'Tunis' });
      assert.strictEqual(res.name, 'Sarra Ben Mansour');
    });

    test('Email: is optional when omitted, null, or whitespace', () => {
      const r1 = extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: 'Rue 123', governorate: 'Tunis' });
      assert.strictEqual(r1.email, null);

      const r2 = extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: 'Rue 123', email: null, governorate: 'Tunis' });
      assert.strictEqual(r2.email, null);

      const r3 = extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: 'Rue 123', email: '   ', governorate: 'Tunis' });
      assert.strictEqual(r3.email, null);
    });

    test('Email: rejects invalid email format when provided', () => {
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: 'Tunis', governorate: 'Tunis', email: 'invalid' }), /adresse e-mail valide/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: 'Tunis', governorate: 'Tunis', email: 'test@' }), /adresse e-mail valide/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: 'Tunis', governorate: 'Tunis', email: '@example.com' }), /adresse e-mail valide/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: 'Tunis', governorate: 'Tunis', email: 'test@domain' }), /adresse e-mail valide/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: 'Tunis', governorate: 'Tunis', email: 12345 }), /adresse e-mail valide/);
    });

    test('Email: normalizes valid email to trimmed lowercase', () => {
      const res = extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: 'Rue 123', email: '  Ahmed.Test@Silky.TN  ', governorate: 'Tunis' });
      assert.strictEqual(res.email, 'ahmed.test@silky.tn');
    });

    test('Governorate: rejects missing, invalid, or fake governorates', () => {
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: '123 Rue' }), /gouvernorat est obligatoire/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: '123 Rue', governorate: '' }), /gouvernorat est obligatoire/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: '123 Rue', governorateId: 999 }), /Gouvernorat invalide/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: '123 Rue', governorate: 'fake' }), /Gouvernorat invalide/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: '123 Rue', governorate: {} }), /Gouvernorat invalide/);
    });

    test('Governorate: resolves canonical governorates and strips redundant address prefix', () => {
      const g1 = extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: '123 Rue de la Liberté', governorateId: 1 });
      assert.strictEqual(g1.governorateId, 1);
      assert.strictEqual(g1.governorate, 'Tunis');
      assert.strictEqual(g1.address, '123 Rue de la Liberté');

      const g2 = extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: 'Tunis — 123 Rue de la Liberté', governorate: 'Tunis' });
      assert.strictEqual(g2.governorateId, 1);
      assert.strictEqual(g2.address, '123 Rue de la Liberté');
    });

    test('Address: rejects missing or non-string address', () => {
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', governorate: 'Tunis' }), /adresse de livraison est obligatoire/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: '', governorate: 'Tunis' }), /adresse de livraison est obligatoire/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: '   ', governorate: 'Tunis' }), /adresse de livraison est obligatoire/);
      assert.throws(() => extractCustomerInfo({ name: 'Ahmed Ben Ali', phone: '98765432', address: 12345, governorate: 'Tunis' }), /adresse de livraison est obligatoire/);
    });

    // -------------------------------------------------------------
    // SECTION 2: END-TO-END HTTP API BYPASS PREVENTION
    // -------------------------------------------------------------
    console.log('\n--- 2. END-TO-END HTTP API BYPASS PREVENTION ---');

    // Fetch active product variant for real API calls
    const prodsRes = await request('/products');
    assert.strictEqual(prodsRes.status, 200, 'Fetch products');
    const product = prodsRes.data.find((p) => p.colors?.length && p.sizes?.length && p.stock);
    assert.ok(product, 'Found test product');
    const colorId = product.colors[0].id;
    const size = product.sizes[0];
    const variant = await productRepository.findVariantForOrderItem(product.id, colorId, size);
    assert.ok(variant, 'Found test variant');
    await inventoryService.updateVariantStock(variant.id, 50);

    const initialOrderCount = await getOrderCount();
    console.log(`  Initial orders count in PostgreSQL: ${initialOrderCount}`);

    // Category A: Direct Order Creation (POST /api/orders)
    await asyncTest('POST /api/orders: Rejects bypass with short phone number (400)', async () => {
      const res = await request('/orders', {
        method: 'POST',
        body: {
          customer: { name: 'Direct Attacker', phone: '12345', address: 'Tunis' },
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('8 chiffres'));
    });

    await asyncTest('POST /api/orders: Rejects bypass with phone containing letters (400)', async () => {
      const res = await request('/orders', {
        method: 'POST',
        body: {
          customer: { name: 'Direct Attacker', phone: '1234abcd', address: 'Tunis' },
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('8 chiffres'));
    });

    await asyncTest('POST /api/orders: Rejects bypass with short customer name (400)', async () => {
      const res = await request('/orders', {
        method: 'POST',
        body: {
          customer: { name: 'Al', phone: '98765432', address: 'Tunis' },
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('au moins 3 lettres'));
    });

    await asyncTest('POST /api/orders: Rejects bypass with alphanumeric customer name (400)', async () => {
      const res = await request('/orders', {
        method: 'POST',
        body: {
          customer: { name: 'Attacker 007', phone: '98765432', address: 'Tunis' },
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('uniquement des lettres'));
    });

    await asyncTest('POST /api/orders: Rejects bypass with invalid customer email (400)', async () => {
      const res = await request('/orders', {
        method: 'POST',
        body: {
          customer: { name: 'Attacker User', phone: '98765432', email: 'attacker@invaliddomain', address: 'Tunis' },
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('adresse e-mail valide'));
    });

    // Category B: Direct Checkout / Buy Now (POST /api/orders/checkout with buyNowItem)
    await asyncTest('POST /api/orders/checkout (Buy Now): Rejects bypass with invalid phone (400)', async () => {
      const res = await request('/orders/checkout', {
        method: 'POST',
        body: {
          customer: {
            firstName: 'Mohamed',
            lastName: 'Salah',
            phone: '9876 5432', // Space embedded
            address: 'Ariana',
          },
          buyNowItem: {
            productId: product.id,
            colorId,
            size,
            quantity: 1,
          },
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('8 chiffres'));
    });

    await asyncTest('POST /api/orders/checkout (Buy Now): Rejects bypass with non-letter lastName (400)', async () => {
      const res = await request('/orders/checkout', {
        method: 'POST',
        body: {
          customer: {
            firstName: 'Mohamed',
            lastName: 'Salah123',
            phone: '98765432',
            address: 'Ariana',
          },
          buyNowItem: {
            productId: product.id,
            colorId,
            size,
            quantity: 1,
          },
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('uniquement des lettres'));
    });

    await asyncTest('POST /api/orders/checkout (Buy Now): Rejects bypass with missing address (400)', async () => {
      const res = await request('/orders/checkout', {
        method: 'POST',
        body: {
          customer: {
            firstName: 'Mohamed',
            lastName: 'Salah',
            phone: '98765432',
            governorate: 'Ariana',
            address: '   ',
          },
          buyNowItem: {
            productId: product.id,
            colorId,
            size,
            quantity: 1,
          },
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('adresse de livraison est obligatoire'));
    });

    // Category C: Admin Manual Order (POST /api/admin/orders/manual)
    const adminLoginRes = await request('/admin/login', {
      method: 'POST',
      body: { password: process.env.ADMIN_PASSWORD || 'admin123' },
    });
    assert.strictEqual(adminLoginRes.status, 200, 'Admin login succeeds');
    const adminToken = adminLoginRes.data.token;

    await asyncTest('POST /api/admin/orders/manual: Rejects invalid phone number (400)', async () => {
      const res = await request('/admin/orders/manual', {
        method: 'POST',
        token: adminToken,
        body: {
          customerName: 'Samir Trabelsi',
          phoneNumber: '1234',
          governorate: 'Sfax',
          shippingAddress: 'Rue Habib Bourguiba',
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('8 chiffres'));
    });

    await asyncTest('POST /api/admin/orders/manual: Rejects invalid customer name (400)', async () => {
      const res = await request('/admin/orders/manual', {
        method: 'POST',
        token: adminToken,
        body: {
          customerName: 'Samir999',
          phoneNumber: '55443322',
          governorate: 'Sfax',
          shippingAddress: 'Rue Habib Bourguiba',
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('uniquement des lettres'));
    });

    await asyncTest('POST /api/admin/orders/manual: Rejects invalid customer email (400)', async () => {
      const res = await request('/admin/orders/manual', {
        method: 'POST',
        token: adminToken,
        body: {
          customerName: 'Samir Trabelsi',
          phoneNumber: '55443322',
          customerEmail: 'samir@not-an-email',
          governorate: 'Sfax',
          shippingAddress: 'Rue Habib Bourguiba',
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data?.error?.includes('adresse e-mail valide'));
    });

    // -------------------------------------------------------------
    // SECTION 3: DATABASE VERIFICATION OF ZERO PERSISTENCE
    // -------------------------------------------------------------
    console.log('\n--- 3. DATABASE ZERO-PERSISTENCE VERIFICATION ---');

    await asyncTest('Zero orders created during all 11 rejected bypass attempts', async () => {
      const currentCount = await getOrderCount();
      assert.strictEqual(
        currentCount,
        initialOrderCount,
        `Expected exactly ${initialOrderCount} orders in DB, found ${currentCount}`
      );
    });

    // -------------------------------------------------------------
    // SECTION 4: POSITIVE SCENARIOS & FINANCIAL INVARIANTS
    // -------------------------------------------------------------
    console.log('\n--- 4. POSITIVE VALID ORDERS & BUSINESS INVARIANTS ---');

    const vFresh = await productRepository.findVariantById(variant.id);
    const stockBefore = vFresh.stockQuantity;

    // 4.1 Valid Direct Order
    let createdDirectOrder;
    await asyncTest('POST /api/orders: Valid order succeeds with 201', async () => {
      const res = await request('/orders', {
        method: 'POST',
        body: {
          customer: {
            name: 'Khadija Ben Salem',
            phone: '55112233',
            email: 'Khadija.Test@Example.COM',
            governorate: 'Nabeul',
            address: 'Avenue Habib Bourguiba',
          },
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.data?.id);
      assert.strictEqual(res.data.customer?.name, 'Khadija Ben Salem');
      assert.strictEqual(res.data.customer?.phone, '55112233');
      assert.strictEqual(res.data.customer?.email, 'khadija.test@example.com');
      assert.strictEqual(res.data.governorateId, 3);
      assert.strictEqual(res.data.governorate?.name, 'Nabeul');
      assert.strictEqual(res.data.customer?.shippingAddress, 'Avenue Habib Bourguiba');
      createdDirectOrder = res.data;
    });

    // 4.2 Valid Buy Now Checkout
    let createdBuyNowOrder;
    await asyncTest('POST /api/orders/checkout (Buy Now): Valid order succeeds with 201', async () => {
      const res = await request('/orders/checkout', {
        method: 'POST',
        body: {
          customer: {
            firstName: 'Youssef',
            lastName: 'Mahjoub',
            phone: '22334455',
            governorate: 'Monastir',
            address: 'Rue de la Plage',
          },
          buyNowItem: {
            productId: product.id,
            colorId,
            size,
            quantity: 2,
          },
        },
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.data?.id);
      assert.strictEqual(res.data.customer?.name, 'Youssef Mahjoub');
      assert.strictEqual(res.data.customer?.phone, '22334455');
      assert.strictEqual(res.data.customer?.email, null);
      assert.strictEqual(res.data.governorateId, 6);
      assert.strictEqual(res.data.governorate?.name, 'Monastir');
      assert.strictEqual(res.data.customer?.shippingAddress, 'Rue de la Plage');
      createdBuyNowOrder = res.data;
    });

    // 4.3 Valid Admin Manual Order
    let createdManualOrder;
    await asyncTest('POST /api/admin/orders/manual: Valid order succeeds with 201', async () => {
      const res = await request('/admin/orders/manual', {
        method: 'POST',
        token: adminToken,
        body: {
          customerName: 'Leila Chaabane',
          phoneNumber: '99887766',
          customerEmail: 'leila.chaabane@example.com',
          governorate: 'Bizerte',
          shippingAddress: '15 Rue de Tunis',
          items: [{ variantId: variant.id, quantity: 1 }],
        },
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.data?.id);
      assert.strictEqual(res.data.customer?.name, 'Leila Chaabane');
      assert.strictEqual(res.data.customer?.phone, '99887766');
      assert.strictEqual(res.data.customer?.email, 'leila.chaabane@example.com');
      assert.strictEqual(res.data.governorateId, 9);
      assert.strictEqual(res.data.governorate?.name, 'Bizerte');
      assert.strictEqual(res.data.customer?.shippingAddress, '15 Rue de Tunis');
      createdManualOrder = res.data;
    });

    // 4.4 Stock Invariant Verification
    await asyncTest('Variant stock accurately decremented for valid orders only', async () => {
      const vAfter = await productRepository.findVariantById(variant.id);
      // Order 1 bought 1, Order 2 bought 2, Order 3 bought 1 = total 4
      assert.strictEqual(
        vAfter.stockQuantity,
        stockBefore - 4,
        `Expected stock ${stockBefore - 4}, got ${vAfter.stockQuantity}`
      );
    });

    // 4.5 Financial Economics Verification
    await asyncTest('Order financial totals strictly match subtotal + delivery fee', async () => {
      const authoritativeUnitPrice = parseFloat(product.price) - parseFloat(product.discount || 0);

      // Direct Order (qty: 1)
      assert.strictEqual(Number(createdDirectOrder.subtotal), authoritativeUnitPrice * 1);
      assert.strictEqual(
        Number(createdDirectOrder.total),
        Number(createdDirectOrder.subtotal) + Number(createdDirectOrder.deliveryFee)
      );

      // Buy Now Order (qty: 2)
      assert.strictEqual(Number(createdBuyNowOrder.subtotal), authoritativeUnitPrice * 2);
      assert.strictEqual(
        Number(createdBuyNowOrder.total),
        Number(createdBuyNowOrder.subtotal) + Number(createdBuyNowOrder.deliveryFee)
      );

      // Manual Order (qty: 1)
      assert.strictEqual(Number(createdManualOrder.subtotal), authoritativeUnitPrice * 1);
      assert.strictEqual(
        Number(createdManualOrder.total),
        Number(createdManualOrder.subtotal) + Number(createdManualOrder.deliveryFee)
      );
    });

    // 4.6 Final PostgreSQL order row count check
    await asyncTest('PostgreSQL orders table reflects exactly the 3 newly created valid orders', async () => {
      const finalCount = await getOrderCount();
      assert.strictEqual(
        finalCount,
        initialOrderCount + 3,
        `Expected ${initialOrderCount + 3} orders, found ${finalCount}`
      );
    });

    console.log('\n=============================================================');
    console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
    console.log('=============================================================\n');

  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
