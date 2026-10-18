/**
 * Master Business Scenarios Audit
 *
 * Tests 1-10 map exactly to the required test scenarios in the specification.
 *
 * Delivery Economics (authoritative):
 *   Normal delivery:          customer pays +8, carrier costs -7 → +1 TND contribution
 *   Customer-paid exchange:   customer pays +8, carrier costs -7 → +1 TND contribution
 *   Silky-paid exchange:      customer pays  0, carrier costs -7 → -7 TND contribution
 *   Cancellation/return:      customer pays  0, carrier costs  0 →  0 TND contribution
 *
 * For a 50 TND product:
 *   Initial: 50 + 8 - 7 = 51 net
 *   After customer-paid exchange: 51 + 1 = 52 net (gross = 50 + 8 + 8 = 66, carrier = 14)
 *   After silky-paid exchange:    52 - 7 = 45 net (gross = 66 + 0 = 66, carrier = 21)
 */

import '../config/env.js';
import { pool } from '../db/pool.js';
import { runExchangesMigration } from '../db/migrations/add_exchanges.js';
import * as orderService from '../services/order.service.js';
import * as exchangeService from '../services/exchange.service.js';
import * as inventoryService from '../services/inventory.service.js';
import * as analyticsService from '../services/analytics.service.js';
import * as adminService from '../services/admin.service.js';

async function runMasterAudit() {
  console.log('========================================================================');
  console.log('MASTER BUSINESS SCENARIOS AUDIT — TESTS 1-10');
  console.log('Validates all financial, inventory, and analytics calculations exactly.');
  console.log('========================================================================\n');

  await runExchangesMigration(pool);

  // -----------------------------------------------------------------------
  // Resolve product variants
  // We need at least 2 distinct price points for Tests 7 and 8
  // (cheaper and more expensive product).
  // We also need at least 4 distinct variants for Test 9.
  //
  // IMPORTANT: varA, varB, varC, varD MUST all have distinct variantIds.
  // varC must differ from BOTH varA and varB (uniqueness takes priority over
  // price preference). varD must differ from all three.
  // -----------------------------------------------------------------------
  const { rows: allVariantRows } = await pool.query(`
    SELECT
      p.id AS product_id, p.title,
      (p.price - p.discount_amount) AS effective_price,
      pv.id AS variant_id, pv.sku
    FROM products p
    JOIN product_variants pv ON pv.product_id = p.id
    WHERE p.is_active = TRUE
    ORDER BY p.price DESC, p.id, pv.id
  `);

  const variantList = allVariantRows.map((r) => ({
    variantId: r.variant_id,
    productId: r.product_id,
    title: r.title,
    price: Number(r.effective_price),
    sku: r.sku,
  }));

  if (variantList.length < 4) {
    console.error('Test requires at least 4 distinct variants.');
    process.exit(1);
  }

  // Primary "expensive" product — ideally 50 TND
  const varA = variantList[0];
  const varB = variantList[1];

  // varC: prefer cheaper than varA, but MUST be distinct from both varA and varB.
  const varC =
    variantList.find((v) => v.variantId !== varA.variantId && v.variantId !== varB.variantId && v.price < varA.price) ||
    variantList.find((v) => v.variantId !== varA.variantId && v.variantId !== varB.variantId) ||
    variantList[2];

  // varD: must differ from varA, varB, and varC.
  const varD =
    variantList.find((v) =>
      v.variantId !== varA.variantId &&
      v.variantId !== varB.variantId &&
      v.variantId !== varC.variantId
    ) || variantList[3];

  // Hard guard — abort if the DB doesn't have enough distinct variants
  const uniqueIds = new Set([varA.variantId, varB.variantId, varC.variantId, varD.variantId]);
  if (uniqueIds.size < 4) {
    console.error(
      `FATAL: Could not resolve 4 distinct variants. Got: A=${varA.variantId}, B=${varB.variantId}, C=${varC.variantId}, D=${varD.variantId}`
    );
    process.exit(1);
  }

  console.log(`Variant A: "${varA.title}" — ${varA.price} TND (${varA.variantId})`);
  console.log(`Variant B: "${varB.title}" — ${varB.price} TND (${varB.variantId})`);
  console.log(`Variant C: "${varC.title}" — ${varC.price} TND [cheaper/distinct] (${varC.variantId})`);
  console.log(`Variant D: "${varD.title}" — ${varD.price} TND (${varD.variantId})\n`);

  async function getStock(variantId) {
    const inv = await inventoryService.getInventory();
    const item = inv.find((v) => (v.variantId || v.id) === variantId);
    return item ? item.stockQuantity : null;
  }

  async function setStock(variantId, qty) {
    await inventoryService.updateVariantStock(variantId, qty);
  }

  // Reset all used variants to 100 stock
  await setStock(varA.variantId, 100);
  await setStock(varB.variantId, 100);
  await setStock(varC.variantId, 100);
  await setStock(varD.variantId, 100);

  const DELIVERY_FEE = 8.0;
  const CARRIER_COST = 7.0;
  const cleanupOrderIds = [];

  let allPassed = true;

  function assert(condition, message) {
    if (!condition) {
      console.error(`  ✗ ASSERTION FAILED: ${message}`);
      allPassed = false;
      throw new Error(message);
    }
  }

  // ========================================================================
  // TEST 1 — Normal 50 TND order
  // Expected:
  //   Customer payment = productPrice + 8
  //   Carrier expense  = 7
  //   Delivery contribution = +1
  //   Net = productPrice + 1
  // ========================================================================
  console.log('------------------------------------------------------------------------');
  console.log('TEST 1 — Normal Order (product A, delivery = 8 TND, carrier = 7 TND)');
  console.log('------------------------------------------------------------------------');
  const base1 = await analyticsService.getAnalytics();

  const ord1 = await adminService.createManualOrder({
    customerName: 'Client Test Un', phoneNumber: '90010001', orderSource: 'phone',
    customerEmail: 'T1@test.com', governorate: 'Tunis', shippingAddress: 'Rue Habib Bourguiba',
    deliveryFee: DELIVERY_FEE,
    items: [{ variantId: varA.variantId, quantity: 1 }],
  });
  await orderService.confirmOrder(ord1.id);
  cleanupOrderIds.push(ord1.id);

  const s1 = await analyticsService.getAnalytics();
  const t1_grossInc  = s1.kpi.totalRevenue              - base1.kpi.totalRevenue;
  const t1_carrierInc = s1.delivery.deliveryCompanyExpense - base1.delivery.deliveryCompanyExpense;
  const t1_marginInc = s1.delivery.deliveryMargin        - base1.delivery.deliveryMargin;
  const t1_netInc    = s1.kpi.netRevenue                - base1.kpi.netRevenue;

  const t1_expGross  = varA.price + DELIVERY_FEE;
  const t1_expCarrier = CARRIER_COST;
  const t1_expMargin = DELIVERY_FEE - CARRIER_COST; // +1
  const t1_expNet    = varA.price + t1_expMargin;

  console.log(`  Gross revenue increment:  ${t1_grossInc} (Expected: ${t1_expGross})`);
  console.log(`  Carrier expense increment: ${t1_carrierInc} (Expected: ${t1_expCarrier})`);
  console.log(`  Delivery margin increment: ${t1_marginInc} (Expected: ${t1_expMargin})`);
  console.log(`  Net revenue increment:     ${t1_netInc} (Expected: ${t1_expNet})`);

  assert(t1_grossInc === t1_expGross,   `Test 1: Gross revenue ${t1_grossInc} ≠ ${t1_expGross}`);
  assert(t1_carrierInc === t1_expCarrier, `Test 1: Carrier expense ${t1_carrierInc} ≠ ${t1_expCarrier}`);
  assert(t1_marginInc === t1_expMargin, `Test 1: Delivery margin ${t1_marginInc} ≠ ${t1_expMargin}`);
  assert(t1_netInc === t1_expNet,       `Test 1: Net revenue ${t1_netInc} ≠ ${t1_expNet}`);
  console.log('  ✓ TEST 1 PASSED!\n');

  // ========================================================================
  // TEST 2 — Customer-paid exchange
  // A 50-TND product order, then customer-paid exchange to varB.
  //
  // Gross customer revenue = productB + 8 (initial delivery) + 8 (exchange delivery)
  // Carrier expense        = 7 + 7 = 14
  // Net                    = Gross - 14 = productB + 2
  // Delivery contribution  = +1 (initial) + 1 (exchange) = +2
  //
  // Required (from spec, for 50 TND product with 50 TND exchange product):
  //   Gross = 66, Carrier = 14, Net = 52
  // ========================================================================
  console.log('------------------------------------------------------------------------');
  console.log('TEST 2 — Customer-Paid Exchange (A → B)');
  console.log('  Expected: Gross = productB + 16, Carrier = 14, Net = productB + 2');
  console.log('------------------------------------------------------------------------');
  const base2 = await analyticsService.getAnalytics();

  const ord2 = await adminService.createManualOrder({
    customerName: 'Client Test Deux', phoneNumber: '90010002', orderSource: 'phone',
    customerEmail: 'T2@test.com', governorate: 'Tunis', shippingAddress: 'Rue Habib Bourguiba',
    deliveryFee: DELIVERY_FEE,
    items: [{ variantId: varA.variantId, quantity: 1 }],
  });
  await orderService.confirmOrder(ord2.id);
  cleanupOrderIds.push(ord2.id);

  await exchangeService.createExchange({
    orderId: ord2.id,
    customer: { customerName: 'Client Test Deux', phoneNumber: '90010002', shippingAddress: 'Tunis' },
    deliveryFee: DELIVERY_FEE,
    paymentResponsibility: 'customer_paid',
    items: [{ variantId: varB.variantId, action: 'add', quantity: 1 }],
  });

  const s2 = await analyticsService.getAnalytics();
  const t2_grossInc   = s2.kpi.totalRevenue              - base2.kpi.totalRevenue;
  const t2_carrierInc = s2.delivery.deliveryCompanyExpense - base2.delivery.deliveryCompanyExpense;
  const t2_marginInc  = s2.delivery.deliveryMargin        - base2.delivery.deliveryMargin;
  const t2_netInc     = s2.kpi.netRevenue                - base2.kpi.netRevenue;

  // Gross = varB.price + 8 (initial) + 8 (exchange delivery paid by customer)
  const t2_expGross   = varB.price + DELIVERY_FEE + DELIVERY_FEE;
  const t2_expCarrier = CARRIER_COST + CARRIER_COST; // 14
  const t2_expMargin  = (DELIVERY_FEE + DELIVERY_FEE) - t2_expCarrier; // 16 - 14 = +2
  const t2_expNet     = t2_expGross - t2_expCarrier;   // varB.price + 2

  console.log(`  Gross revenue increment:   ${t2_grossInc}  (Expected: ${t2_expGross})`);
  console.log(`  Carrier expense increment: ${t2_carrierInc} (Expected: ${t2_expCarrier})`);
  console.log(`  Delivery margin increment: ${t2_marginInc}  (Expected: ${t2_expMargin})`);
  console.log(`  Net revenue increment:     ${t2_netInc}  (Expected: ${t2_expNet})`);

  assert(t2_grossInc === t2_expGross,     `Test 2: Gross revenue ${t2_grossInc} ≠ ${t2_expGross}`);
  assert(t2_carrierInc === t2_expCarrier, `Test 2: Carrier expense ${t2_carrierInc} ≠ ${t2_expCarrier}`);
  assert(t2_marginInc === t2_expMargin,   `Test 2: Delivery margin ${t2_marginInc} ≠ ${t2_expMargin}`);
  assert(t2_netInc === t2_expNet,         `Test 2: Net revenue ${t2_netInc} ≠ ${t2_expNet}`);
  console.log('  ✓ TEST 2 PASSED!\n');

  // ========================================================================
  // TEST 3 — Silky-paid exchange
  // A 50-TND product order, then Silky-paid exchange (customer pays 0).
  //
  // Gross customer revenue = productB + 8 (initial delivery) + 0 (exchange delivery)
  // Carrier expense        = 7 + 7 = 14
  // Net                    = Gross - 14 = productB - 6
  // Delivery contribution  = +1 (initial) - 7 (exchange) = -6
  //
  // Required (spec, 50 TND → 50 TND exchange):
  //   Gross customer revenue = 58, Carrier = 14, Net = 44
  // ========================================================================
  console.log('------------------------------------------------------------------------');
  console.log('TEST 3 — Silky-Paid Exchange (A → B, customer fee = 0)');
  console.log('  Expected: Gross = productB + 8, Carrier = 14, Net = productB - 6');
  console.log('------------------------------------------------------------------------');
  const base3 = await analyticsService.getAnalytics();

  const ord3 = await adminService.createManualOrder({
    customerName: 'Client Test Trois', phoneNumber: '90010003', orderSource: 'phone',
    customerEmail: 'T3@test.com', governorate: 'Tunis', shippingAddress: 'Rue Habib Bourguiba',
    deliveryFee: DELIVERY_FEE,
    items: [{ variantId: varA.variantId, quantity: 1 }],
  });
  await orderService.confirmOrder(ord3.id);
  cleanupOrderIds.push(ord3.id);

  await exchangeService.createExchange({
    orderId: ord3.id,
    customer: { customerName: 'Client Test Trois', phoneNumber: '90010003', shippingAddress: 'Tunis' },
    paymentResponsibility: 'silky_paid',
    items: [{ variantId: varB.variantId, action: 'add', quantity: 1 }],
  });

  const s3 = await analyticsService.getAnalytics();
  const t3_grossInc   = s3.kpi.totalRevenue              - base3.kpi.totalRevenue;
  const t3_carrierInc = s3.delivery.deliveryCompanyExpense - base3.delivery.deliveryCompanyExpense;
  const t3_marginInc  = s3.delivery.deliveryMargin        - base3.delivery.deliveryMargin;
  const t3_netInc     = s3.kpi.netRevenue                - base3.kpi.netRevenue;

  // Gross = varB.price + 8 (initial delivery) + 0 (silky pays exchange delivery)
  const t3_expGross   = varB.price + DELIVERY_FEE + 0;
  const t3_expCarrier = CARRIER_COST + CARRIER_COST; // 14 — carrier still costs 7 for the exchange
  const t3_expMargin  = (DELIVERY_FEE + 0) - t3_expCarrier; // 8 - 14 = -6
  const t3_expNet     = t3_expGross - t3_expCarrier; // varB.price - 6

  console.log(`  Gross revenue increment:   ${t3_grossInc}  (Expected: ${t3_expGross})`);
  console.log(`  Carrier expense increment: ${t3_carrierInc} (Expected: ${t3_expCarrier})`);
  console.log(`  Delivery margin increment: ${t3_marginInc}  (Expected: ${t3_expMargin})`);
  console.log(`  Net revenue increment:     ${t3_netInc}  (Expected: ${t3_expNet})`);

  assert(t3_grossInc === t3_expGross,     `Test 3: Gross revenue ${t3_grossInc} ≠ ${t3_expGross}`);
  assert(t3_carrierInc === t3_expCarrier, `Test 3: Carrier expense ${t3_carrierInc} ≠ ${t3_expCarrier}`);
  assert(t3_marginInc === t3_expMargin,   `Test 3: Delivery margin ${t3_marginInc} ≠ ${t3_expMargin}`);
  assert(t3_netInc === t3_expNet,         `Test 3: Net revenue ${t3_netInc} ≠ ${t3_expNet}`);
  console.log('  ✓ TEST 3 PASSED!\n');

  // ========================================================================
  // TEST 4 — Customer-paid exchange followed by Silky-paid exchange
  //
  // Intended scenario (preserved exactly):
  //   Initial order: varA × 1, delivery fee = 8 TND, carrier = 7 TND.
  //
  //   Exchange 1: ADD varB × 1, customer_paid, delivery fee = 8 TND.
  //     - varA (omitted) is RETURNED by the exchange system (existing semantics).
  //     - Customer holds: varB × 1.
  //     - Warehouse: A +1 (restored), B -1 (deducted).
  //
  //   Exchange 2: ADD varC × 1, silky_paid, delivery fee = 0 TND.
  //     - varB (omitted) is RETURNED by the exchange system (existing semantics).
  //     - Customer holds: varC × 1.
  //     - Warehouse: B +1 (restored), C -1 (deducted).
  //
  //   varA, varB, varC are THREE DISTINCT variant IDs (enforced above and
  //   verified explicitly before the scenario runs).
  //
  // Analytics increments:
  //   Gross = active subtotal + all customer-paid delivery fees
  //         = varC.price + 8 (initial) + 8 (exch1 customer_paid) + 0 (exch2 silky_paid)
  //         = varC.price + 16
  //   Carrier = 7 (initial) + 7 (exch1) + 7 (exch2) = 21
  //   Margin  = (8 + 8 + 0) - 21 = -5
  //   Net     = Gross - 21 = varC.price - 5
  // ========================================================================
  console.log('------------------------------------------------------------------------');
  console.log('TEST 4 — Customer-Paid Exchange → Silky-Paid Exchange (A → B → C)');
  console.log(`  varA=${varA.variantId}, varB=${varB.variantId}, varC=${varC.variantId}`);
  console.log('  Expected: Gross = varC.price + 16, Carrier = 21, Net = varC.price - 5');
  console.log('------------------------------------------------------------------------');

  // ── PRE-TEST: Verify A, B, C are three distinct variant IDs ──────────────
  assert(
    varA.variantId !== varB.variantId,
    `Test 4 pre-check: varA (${varA.variantId}) must differ from varB (${varB.variantId})`
  );
  assert(
    varA.variantId !== varC.variantId,
    `Test 4 pre-check: varA (${varA.variantId}) must differ from varC (${varC.variantId})`
  );
  assert(
    varB.variantId !== varC.variantId,
    `Test 4 pre-check: varB (${varB.variantId}) must differ from varC (${varC.variantId})`
  );
  console.log('  ✓ Pre-check: A, B, C are three distinct variant IDs.');

  const base4 = await analyticsService.getAnalytics();
  await setStock(varA.variantId, 50);
  await setStock(varB.variantId, 50);
  await setStock(varC.variantId, 50);

  const ord4 = await adminService.createManualOrder({
    customerName: 'Client Test Quatre', phoneNumber: '90010004', orderSource: 'phone',
    customerEmail: 'T4@test.com', governorate: 'Tunis', shippingAddress: 'Rue Habib Bourguiba',
    deliveryFee: DELIVERY_FEE,
    items: [{ variantId: varA.variantId, quantity: 1 }],
  });
  await orderService.confirmOrder(ord4.id);
  cleanupOrderIds.push(ord4.id);

  // Stock after initial order: A = 49, B = 50, C = 50
  assert(await getStock(varA.variantId) === 49, 'Test 4: Initial order should deduct A stock to 49');
  assert(await getStock(varB.variantId) === 50, 'Test 4: B stock should remain 50 after initial order');
  assert(await getStock(varC.variantId) === 50, 'Test 4: C stock should remain 50 after initial order');

  // Exchange 1: customer-paid, ADD varB × 1.
  // Omitted varA is returned → A restored to 50, B deducted to 49.
  await exchangeService.createExchange({
    orderId: ord4.id,
    customer: { customerName: 'Client Test Quatre', phoneNumber: '90010004', shippingAddress: 'Tunis' },
    deliveryFee: DELIVERY_FEE,
    paymentResponsibility: 'customer_paid',
    items: [{ variantId: varB.variantId, action: 'add', quantity: 1 }],
  });

  // Stock after Exchange 1: A = 50 (restored), B = 49 (deducted), C = 50
  const sA4_post1 = await getStock(varA.variantId);
  const sB4_post1 = await getStock(varB.variantId);
  const sC4_post1 = await getStock(varC.variantId);
  console.log(`  Post-Exchange-1: A=${sA4_post1}(exp 50), B=${sB4_post1}(exp 49), C=${sC4_post1}(exp 50)`);
  assert(sA4_post1 === 50, `Test 4: After Exch1, A should be 50 (restored), got ${sA4_post1}`);
  assert(sB4_post1 === 49, `Test 4: After Exch1, B should be 49 (deducted), got ${sB4_post1}`);
  assert(sC4_post1 === 50, `Test 4: After Exch1, C should be 50 (untouched), got ${sC4_post1}`);

  // Exchange 2: silky-paid, ADD varC × 1.
  // Omitted varB is returned → B restored to 50, C deducted to 49.
  await exchangeService.createExchange({
    orderId: ord4.id,
    customer: { customerName: 'Client Test Quatre', phoneNumber: '90010004', shippingAddress: 'Tunis' },
    paymentResponsibility: 'silky_paid',
    items: [{ variantId: varC.variantId, action: 'add', quantity: 1 }],
  });

  // Stock after Exchange 2: A = 50, B = 50 (restored), C = 49 (deducted)
  const sA4_post2 = await getStock(varA.variantId);
  const sB4_post2 = await getStock(varB.variantId);
  const sC4_post2 = await getStock(varC.variantId);
  console.log(`  Post-Exchange-2: A=${sA4_post2}(exp 50), B=${sB4_post2}(exp 50), C=${sC4_post2}(exp 49)`);
  assert(sA4_post2 === 50, `Test 4: After Exch2, A should be 50, got ${sA4_post2}`);
  assert(sB4_post2 === 50, `Test 4: After Exch2, B should be 50 (restored), got ${sB4_post2}`);
  assert(sC4_post2 === 49, `Test 4: After Exch2, C should be 49 (deducted), got ${sC4_post2}`);

  // ── DB-level exchange record verification ─────────────────────────────────
  const ord4Fetched = await orderService.getOrderById(ord4.id);
  assert(ord4Fetched.exchanges.length === 2, `Test 4: Expected 2 exchange records, got ${ord4Fetched.exchanges.length}`);
  const exch4_1 = ord4Fetched.exchanges.find((e) => e.exchangeSequence === 1);
  const exch4_2 = ord4Fetched.exchanges.find((e) => e.exchangeSequence === 2);
  assert(exch4_1, 'Test 4: Exchange record #1 missing');
  assert(exch4_2, 'Test 4: Exchange record #2 missing');

  // Exchange 1 record
  assert(
    exch4_1.paymentResponsibility === 'customer_paid',
    `Test 4: Exch1 paymentResponsibility should be customer_paid, got ${exch4_1.paymentResponsibility}`
  );
  assert(
    Number(exch4_1.deliveryFee) === DELIVERY_FEE,
    `Test 4: Exch1 deliveryFee should be ${DELIVERY_FEE}, got ${exch4_1.deliveryFee}`
  );
  assert(
    Number(exch4_1.subtotal) === varB.price,
    `Test 4: Exch1 subtotal should be varB.price=${varB.price}, got ${exch4_1.subtotal}`
  );

  // Exchange 2 record
  assert(
    exch4_2.paymentResponsibility === 'silky_paid',
    `Test 4: Exch2 paymentResponsibility should be silky_paid, got ${exch4_2.paymentResponsibility}`
  );
  assert(
    Number(exch4_2.deliveryFee) === 0,
    `Test 4: Exch2 deliveryFee should be 0 (silky_paid), got ${exch4_2.deliveryFee}`
  );
  assert(
    Number(exch4_2.subtotal) === varC.price,
    `Test 4: Exch2 subtotal should be varC.price=${varC.price}, got ${exch4_2.subtotal}`
  );
  console.log('  ✓ Exchange DB records verified (responsibility, fee, subtotal).');

  // ── Analytics assertions ──────────────────────────────────────────────────
  const s4 = await analyticsService.getAnalytics();
  const t4_grossInc   = s4.kpi.totalRevenue              - base4.kpi.totalRevenue;
  const t4_carrierInc = s4.delivery.deliveryCompanyExpense - base4.delivery.deliveryCompanyExpense;
  const t4_marginInc  = s4.delivery.deliveryMargin        - base4.delivery.deliveryMargin;
  const t4_netInc     = s4.kpi.netRevenue                - base4.kpi.netRevenue;

  // Gross = active product subtotal + all delivery fees paid by customer
  //       = varC.price + 8 (initial) + 8 (exch1 customer-paid) + 0 (exch2 silky-paid)
  //       = varC.price + 16
  const t4_expGross   = varC.price + DELIVERY_FEE + DELIVERY_FEE + 0;
  const t4_expCarrier = CARRIER_COST + CARRIER_COST + CARRIER_COST; // 3 × 7 = 21
  const t4_expMargin  = (DELIVERY_FEE + DELIVERY_FEE + 0) - t4_expCarrier; // 16 - 21 = -5
  const t4_expNet     = t4_expGross - t4_expCarrier;

  console.log(`  Gross revenue increment:   ${t4_grossInc}  (Expected: ${t4_expGross})`);
  console.log(`  Carrier expense increment: ${t4_carrierInc} (Expected: ${t4_expCarrier})`);
  console.log(`  Delivery margin increment: ${t4_marginInc}  (Expected: ${t4_expMargin})`);
  console.log(`  Net revenue increment:     ${t4_netInc}  (Expected: ${t4_expNet})`);

  assert(t4_grossInc === t4_expGross,     `Test 4: Gross revenue ${t4_grossInc} ≠ ${t4_expGross}`);
  assert(t4_carrierInc === t4_expCarrier, `Test 4: Carrier expense ${t4_carrierInc} ≠ ${t4_expCarrier}`);
  assert(t4_marginInc === t4_expMargin,   `Test 4: Delivery margin ${t4_marginInc} ≠ ${t4_expMargin}`);
  assert(t4_netInc === t4_expNet,         `Test 4: Net revenue ${t4_netInc} ≠ ${t4_expNet}`);
  console.log('  ✓ TEST 4 PASSED!\n');



  // ========================================================================
  // TEST 5 — Multiple mixed exchanges
  // Sequence: Normal → Customer-paid → Silky-paid → Customer-paid
  //
  // Delivery contributions per operation:
  //   Initial:          +8 customer, -7 carrier → +1
  //   Exchange 1 (cust): +8 customer, -7 carrier → +1
  //   Exchange 2 (silky): 0 customer, -7 carrier → -7
  //   Exchange 3 (cust): +8 customer, -7 carrier → +1
  //
  // Total delivery contribution = +1 + 1 - 7 + 1 = -4 TND
  //
  // Active product after all 3 exchanges is varA (returned to original).
  // Gross = varA.price + 8 + 8 + 0 + 8 = varA.price + 24
  // Carrier = 7 × 4 = 28
  // Net = (varA.price + 24) - 28 = varA.price - 4
  // Delivery margin = 24 - 28 = -4 ✓
  // ========================================================================
  console.log('------------------------------------------------------------------------');
  console.log('TEST 5 — Multiple Mixed Exchanges (Initial → Cust → Silky → Cust)');
  console.log('  Delivery contributions: +1 +1 -7 +1 = -4 TND total delivery margin');
  console.log('------------------------------------------------------------------------');
  const base5 = await analyticsService.getAnalytics();
  await setStock(varA.variantId, 50);
  await setStock(varB.variantId, 50);
  await setStock(varC.variantId, 50);

  const ord5 = await adminService.createManualOrder({
    customerName: 'Client Test Cinq', phoneNumber: '90010005', orderSource: 'phone',
    customerEmail: 'T5@test.com', governorate: 'Tunis', shippingAddress: 'Rue Habib Bourguiba',
    deliveryFee: DELIVERY_FEE,
    items: [{ variantId: varA.variantId, quantity: 1 }],
  });
  await orderService.confirmOrder(ord5.id);
  cleanupOrderIds.push(ord5.id);

  // Exchange 1: customer-paid (A → B)
  await exchangeService.createExchange({
    orderId: ord5.id,
    customer: { customerName: 'Client Test Cinq', phoneNumber: '90010005', shippingAddress: 'Tunis' },
    deliveryFee: DELIVERY_FEE,
    paymentResponsibility: 'customer_paid',
    items: [{ variantId: varB.variantId, action: 'add', quantity: 1 }],
  });

  // Exchange 2: silky-paid (B → C)
  await exchangeService.createExchange({
    orderId: ord5.id,
    customer: { customerName: 'Client Test Cinq', phoneNumber: '90010005', shippingAddress: 'Tunis' },
    paymentResponsibility: 'silky_paid',
    items: [{ variantId: varC.variantId, action: 'add', quantity: 1 }],
  });

  // Exchange 3: customer-paid (C → A)
  await exchangeService.createExchange({
    orderId: ord5.id,
    customer: { customerName: 'Client Test Cinq', phoneNumber: '90010005', shippingAddress: 'Tunis' },
    deliveryFee: DELIVERY_FEE,
    paymentResponsibility: 'customer_paid',
    items: [{ variantId: varA.variantId, action: 'add', quantity: 1 }],
  });

  const s5 = await analyticsService.getAnalytics();
  const t5_grossInc   = s5.kpi.totalRevenue              - base5.kpi.totalRevenue;
  const t5_carrierInc = s5.delivery.deliveryCompanyExpense - base5.delivery.deliveryCompanyExpense;
  const t5_marginInc  = s5.delivery.deliveryMargin        - base5.delivery.deliveryMargin;
  const t5_netInc     = s5.kpi.netRevenue                - base5.kpi.netRevenue;

  // Gross = active product (varA) + all customer-paid deliveries
  //       = varA.price + 8 (initial) + 8 (exch1) + 0 (exch2) + 8 (exch3) = varA.price + 24
  const t5_expGross   = varA.price + DELIVERY_FEE + DELIVERY_FEE + 0 + DELIVERY_FEE;
  const t5_expCarrier = CARRIER_COST * 4; // 4 deliveries × 7 = 28
  const t5_expMargin  = (DELIVERY_FEE + DELIVERY_FEE + 0 + DELIVERY_FEE) - t5_expCarrier; // 24 - 28 = -4
  const t5_expNet     = t5_expGross - t5_expCarrier;

  console.log(`  Gross revenue increment:   ${t5_grossInc}  (Expected: ${t5_expGross})`);
  console.log(`  Carrier expense increment: ${t5_carrierInc} (Expected: ${t5_expCarrier})`);
  console.log(`  Delivery margin increment: ${t5_marginInc}  (Expected: ${t5_expMargin}  ← must be -4)`);
  console.log(`  Net revenue increment:     ${t5_netInc}  (Expected: ${t5_expNet})`);

  assert(t5_grossInc === t5_expGross,     `Test 5: Gross revenue ${t5_grossInc} ≠ ${t5_expGross}`);
  assert(t5_carrierInc === t5_expCarrier, `Test 5: Carrier expense ${t5_carrierInc} ≠ ${t5_expCarrier}`);
  assert(t5_marginInc === t5_expMargin,   `Test 5: Delivery margin ${t5_marginInc} ≠ ${t5_expMargin} (expected -4)`);
  assert(t5_netInc === t5_expNet,         `Test 5: Net revenue ${t5_netInc} ≠ ${t5_expNet}`);
  console.log('  ✓ TEST 5 PASSED!\n');

  // ========================================================================
  // TEST 6 — Repeated Silky-paid exchanges
  // Every operation must:
  //   - succeed
  //   - persist silky_paid independently
  //   - add exactly -7 TND delivery contribution each time
  //   - add 0 TND customer delivery revenue
  //   - maintain correct stock
  //   - appear correctly in analytics
  //
  // Sequence: Normal → Silky1 → Silky2 → Silky3
  // Delivery contributions: +1 -7 -7 -7 = -20 TND
  // Gross = varA.price + 8 (initial only, all exchange deliveries = 0)
  // Carrier = 7 × 4 = 28
  // Net = (varA.price + 8) - 28 = varA.price - 20
  // ========================================================================
  console.log('------------------------------------------------------------------------');
  console.log('TEST 6 — Repeated Silky-Paid Exchanges (A → B → C → A)');
  console.log('  Each silky-paid exchange adds -7 TND delivery contribution.');
  console.log('  Delivery contributions: +1 -7 -7 -7 = -20 TND total');
  console.log('------------------------------------------------------------------------');
  const base6 = await analyticsService.getAnalytics();
  await setStock(varA.variantId, 50);
  await setStock(varB.variantId, 50);
  await setStock(varC.variantId, 50);

  const ord6 = await adminService.createManualOrder({
    customerName: 'Client Test Six', phoneNumber: '90010006', orderSource: 'phone',
    customerEmail: 'T6@test.com', governorate: 'Tunis', shippingAddress: 'Rue Habib Bourguiba',
    deliveryFee: DELIVERY_FEE,
    items: [{ variantId: varA.variantId, quantity: 1 }],
  });
  await orderService.confirmOrder(ord6.id);
  cleanupOrderIds.push(ord6.id);

  // Silky exchange 1: A → B
  const ex6_1 = await exchangeService.createExchange({
    orderId: ord6.id,
    customer: { customerName: 'Client Test Six', phoneNumber: '90010006', shippingAddress: 'Tunis' },
    paymentResponsibility: 'silky_paid',
    items: [{ variantId: varB.variantId, action: 'add', quantity: 1 }],
  });

  // Silky exchange 2: B → C
  const ex6_2 = await exchangeService.createExchange({
    orderId: ord6.id,
    customer: { customerName: 'Client Test Six', phoneNumber: '90010006', shippingAddress: 'Tunis' },
    paymentResponsibility: 'silky_paid',
    items: [{ variantId: varC.variantId, action: 'add', quantity: 1 }],
  });

  // Silky exchange 3: C → A (back to original)
  const ex6_3 = await exchangeService.createExchange({
    orderId: ord6.id,
    customer: { customerName: 'Client Test Six', phoneNumber: '90010006', shippingAddress: 'Tunis' },
    paymentResponsibility: 'silky_paid',
    items: [{ variantId: varA.variantId, action: 'add', quantity: 1 }],
  });

  // Verify each exchange independently persists silky_paid
  const ord6Fetched = await orderService.getOrderById(ord6.id);
  console.log(`  Exchange records: ${ord6Fetched.exchanges.length} (Expected: 3)`);
  for (const ex of ord6Fetched.exchanges) {
    console.log(`    Exchange #${ex.exchangeSequence}: resp=${ex.paymentResponsibility}, fee=${ex.deliveryFee}`);
    assert(
      ex.paymentResponsibility === 'silky_paid',
      `Exchange #${ex.exchangeSequence} should be silky_paid, got ${ex.paymentResponsibility}`
    );
    assert(
      Number(ex.deliveryFee) === 0,
      `Exchange #${ex.exchangeSequence} customer fee should be 0, got ${ex.deliveryFee}`
    );
  }
  assert(ord6Fetched.exchanges.length === 3, `Test 6: Expected 3 exchange records, got ${ord6Fetched.exchanges.length}`);

  const s6 = await analyticsService.getAnalytics();
  const t6_grossInc   = s6.kpi.totalRevenue              - base6.kpi.totalRevenue;
  const t6_carrierInc = s6.delivery.deliveryCompanyExpense - base6.delivery.deliveryCompanyExpense;
  const t6_marginInc  = s6.delivery.deliveryMargin        - base6.delivery.deliveryMargin;
  const t6_netInc     = s6.kpi.netRevenue                - base6.kpi.netRevenue;

  // Gross = varA.price (active product) + 8 (initial delivery) + 0 + 0 + 0 (silky)
  const t6_expGross   = varA.price + DELIVERY_FEE;
  const t6_expCarrier = CARRIER_COST * 4; // 4 physical deliveries × 7 = 28
  const t6_expMargin  = DELIVERY_FEE - t6_expCarrier; // 8 - 28 = -20
  const t6_expNet     = t6_expGross - t6_expCarrier;

  // Stock: A should be at 50 (restored by ex6_3), B=50, C=50
  const sA6 = await getStock(varA.variantId);
  const sB6 = await getStock(varB.variantId);
  const sC6 = await getStock(varC.variantId);
  console.log(`  Stock A: ${sA6} (Expected: 49), B: ${sB6} (Expected: 50), C: ${sC6} (Expected: 50)`);
  // After ex6_3 (C→A): A was at 50, gets deducted by 1 → 49; C gets restored to 50
  assert(sA6 === 49, `Test 6: Stock A should be 49 (active), got ${sA6}`);
  assert(sB6 === 50, `Test 6: Stock B should be 50 (restored), got ${sB6}`);
  assert(sC6 === 50, `Test 6: Stock C should be 50 (restored), got ${sC6}`);

  console.log(`  Gross revenue increment:   ${t6_grossInc}  (Expected: ${t6_expGross})`);
  console.log(`  Carrier expense increment: ${t6_carrierInc} (Expected: ${t6_expCarrier})`);
  console.log(`  Delivery margin increment: ${t6_marginInc}  (Expected: ${t6_expMargin}  ← must be -20)`);
  console.log(`  Net revenue increment:     ${t6_netInc}  (Expected: ${t6_expNet})`);

  assert(t6_grossInc === t6_expGross,     `Test 6: Gross revenue ${t6_grossInc} ≠ ${t6_expGross}`);
  assert(t6_carrierInc === t6_expCarrier, `Test 6: Carrier expense ${t6_carrierInc} ≠ ${t6_expCarrier}`);
  assert(t6_marginInc === t6_expMargin,   `Test 6: Delivery margin ${t6_marginInc} ≠ ${t6_expMargin}`);
  assert(t6_netInc === t6_expNet,         `Test 6: Net revenue ${t6_netInc} ≠ ${t6_expNet}`);
  console.log('  ✓ TEST 6 PASSED!\n');

  // ========================================================================
  // TEST 7 — Cheaper product exchange
  // Order varA (expensive), exchange to varC (cheaper) with customer-paid.
  //
  // After exchange:
  //   Active product = varC (cheaper)
  //   Gross = varC.price + 8 (initial) + 8 (exchange) = varC.price + 16
  //   Carrier = 14
  //   Net = varC.price + 2
  //   Delivery contribution = +2
  //
  // Inventory: varA restored, varC deducted.
  // ========================================================================
  console.log('------------------------------------------------------------------------');
  console.log('TEST 7 — Cheaper Product Exchange (expensive A → cheaper C)');
  console.log(`  A price: ${varA.price} TND, C price: ${varC.price} TND`);
  console.log('------------------------------------------------------------------------');
  // Ensure varC is actually cheaper
  if (varC.price >= varA.price) {
    console.log('  WARN: varC is not cheaper than varA — skipping inventory price-difference assertions.');
  }

  const base7 = await analyticsService.getAnalytics();
  await setStock(varA.variantId, 50);
  await setStock(varC.variantId, 50);

  const ord7 = await adminService.createManualOrder({
    customerName: 'Client Test Sept', phoneNumber: '90010007', orderSource: 'phone',
    customerEmail: 'T7@test.com', governorate: 'Tunis', shippingAddress: 'Rue Habib Bourguiba',
    deliveryFee: DELIVERY_FEE,
    items: [{ variantId: varA.variantId, quantity: 1 }],
  });
  await orderService.confirmOrder(ord7.id);
  cleanupOrderIds.push(ord7.id);

  assert(await getStock(varA.variantId) === 49, 'Test 7: Initial stock deduction of A failed');

  await exchangeService.createExchange({
    orderId: ord7.id,
    customer: { customerName: 'Client Test Sept', phoneNumber: '90010007', shippingAddress: 'Tunis' },
    deliveryFee: DELIVERY_FEE,
    paymentResponsibility: 'customer_paid',
    items: [{ variantId: varC.variantId, action: 'add', quantity: 1 }],
  });

  const sA7 = await getStock(varA.variantId);
  const sC7 = await getStock(varC.variantId);
  console.log(`  Stock A: ${sA7} (Expected: 50 — restored), C: ${sC7} (Expected: 49 — active)`);
  assert(sA7 === 50, `Test 7: Stock A should be 50 (restored), got ${sA7}`);
  assert(sC7 === 49, `Test 7: Stock C should be 49 (active), got ${sC7}`);

  const s7 = await analyticsService.getAnalytics();
  const t7_grossInc = s7.kpi.totalRevenue - base7.kpi.totalRevenue;
  const t7_netInc   = s7.kpi.netRevenue   - base7.kpi.netRevenue;
  const t7_expGross = varC.price + DELIVERY_FEE + DELIVERY_FEE; // varC.price + 16
  const t7_expNet   = t7_expGross - (CARRIER_COST * 2);         // varC.price + 2

  console.log(`  Gross revenue increment: ${t7_grossInc} (Expected: ${t7_expGross})`);
  console.log(`  Net revenue increment:   ${t7_netInc}   (Expected: ${t7_expNet})`);
  assert(t7_grossInc === t7_expGross, `Test 7: Gross revenue ${t7_grossInc} ≠ ${t7_expGross}`);
  assert(t7_netInc === t7_expNet,     `Test 7: Net revenue ${t7_netInc} ≠ ${t7_expNet}`);
  console.log('  ✓ TEST 7 PASSED!\n');

  // ========================================================================
  // TEST 8 — More expensive product exchange
  // Order varC (cheaper), exchange to varA (expensive) with customer-paid.
  //
  // After exchange:
  //   Active product = varA (more expensive)
  //   Gross = varA.price + 8 (initial) + 8 (exchange) = varA.price + 16
  //   Carrier = 14
  //   Net = varA.price + 2
  //   Delivery contribution = +2
  //
  // Inventory: varC restored, varA deducted.
  // ========================================================================
  console.log('------------------------------------------------------------------------');
  console.log('TEST 8 — More Expensive Product Exchange (cheaper C → expensive A)');
  console.log(`  C price: ${varC.price} TND, A price: ${varA.price} TND`);
  console.log('------------------------------------------------------------------------');

  const base8 = await analyticsService.getAnalytics();
  await setStock(varC.variantId, 50);
  await setStock(varA.variantId, 50);

  const ord8 = await adminService.createManualOrder({
    customerName: 'Client Test Huit', phoneNumber: '90010008', orderSource: 'phone',
    customerEmail: 'T8@test.com', governorate: 'Tunis', shippingAddress: 'Rue Habib Bourguiba',
    deliveryFee: DELIVERY_FEE,
    items: [{ variantId: varC.variantId, quantity: 1 }],
  });
  await orderService.confirmOrder(ord8.id);
  cleanupOrderIds.push(ord8.id);

  assert(await getStock(varC.variantId) === 49, 'Test 8: Initial stock deduction of C failed');

  await exchangeService.createExchange({
    orderId: ord8.id,
    customer: { customerName: 'Client Test Huit', phoneNumber: '90010008', shippingAddress: 'Tunis' },
    deliveryFee: DELIVERY_FEE,
    paymentResponsibility: 'customer_paid',
    items: [{ variantId: varA.variantId, action: 'add', quantity: 1 }],
  });

  const sC8 = await getStock(varC.variantId);
  const sA8 = await getStock(varA.variantId);
  console.log(`  Stock C: ${sC8} (Expected: 50 — restored), A: ${sA8} (Expected: 49 — active)`);
  assert(sC8 === 50, `Test 8: Stock C should be 50 (restored), got ${sC8}`);
  assert(sA8 === 49, `Test 8: Stock A should be 49 (active), got ${sA8}`);

  const s8 = await analyticsService.getAnalytics();
  const t8_grossInc = s8.kpi.totalRevenue - base8.kpi.totalRevenue;
  const t8_netInc   = s8.kpi.netRevenue   - base8.kpi.netRevenue;
  const t8_expGross = varA.price + DELIVERY_FEE + DELIVERY_FEE; // varA.price + 16
  const t8_expNet   = t8_expGross - (CARRIER_COST * 2);         // varA.price + 2

  console.log(`  Gross revenue increment: ${t8_grossInc} (Expected: ${t8_expGross})`);
  console.log(`  Net revenue increment:   ${t8_netInc}   (Expected: ${t8_expNet})`);
  assert(t8_grossInc === t8_expGross, `Test 8: Gross revenue ${t8_grossInc} ≠ ${t8_expGross}`);
  assert(t8_netInc === t8_expNet,     `Test 8: Net revenue ${t8_netInc} ≠ ${t8_expNet}`);
  console.log('  ✓ TEST 8 PASSED!\n');

  // ========================================================================
  // TEST 9 — Multiple exchanges followed by cancellation (A → B → C → D → Cancel)
  //
  // Expected:
  //   - Only D (final active variant) restored on cancellation.
  //   - A, B, C NOT restored again.
  //   - Historical exchange records remain intact.
  //   - Cancelled order contributes 0 TND to active analytics.
  //   - Cancellation delivery expense = 0 additional (exchanges occurred pre-cancel).
  // ========================================================================
  console.log('------------------------------------------------------------------------');
  console.log('TEST 9 — Multiple Exchanges then Cancellation (A → B → C → D → Cancel)');
  console.log('  Only D must be restored. A, B, C must NOT be re-restored.');
  console.log('------------------------------------------------------------------------');

  await setStock(varA.variantId, 50);
  await setStock(varB.variantId, 50);
  await setStock(varC.variantId, 50);
  await setStock(varD.variantId, 50);

  const base9 = await analyticsService.getAnalytics();

  const ord9 = await adminService.createManualOrder({
    customerName: 'Client Test Neuf', phoneNumber: '90010009', orderSource: 'phone',
    customerEmail: 'T9@test.com', governorate: 'Tunis', shippingAddress: 'Rue Habib Bourguiba',
    deliveryFee: DELIVERY_FEE,
    items: [{ variantId: varA.variantId, quantity: 1 }],
  });
  await orderService.confirmOrder(ord9.id);
  cleanupOrderIds.push(ord9.id);

  // A → B
  await exchangeService.createExchange({
    orderId: ord9.id,
    customer: { customerName: 'Client Test Neuf', phoneNumber: '90010009', shippingAddress: 'Tunis' },
    deliveryFee: DELIVERY_FEE, paymentResponsibility: 'customer_paid',
    items: [{ variantId: varB.variantId, action: 'add', quantity: 1 }],
  });
  // B → C
  await exchangeService.createExchange({
    orderId: ord9.id,
    customer: { customerName: 'Client Test Neuf', phoneNumber: '90010009', shippingAddress: 'Tunis' },
    deliveryFee: DELIVERY_FEE, paymentResponsibility: 'customer_paid',
    items: [{ variantId: varC.variantId, action: 'add', quantity: 1 }],
  });
  // C → D
  await exchangeService.createExchange({
    orderId: ord9.id,
    customer: { customerName: 'Client Test Neuf', phoneNumber: '90010009', shippingAddress: 'Tunis' },
    deliveryFee: DELIVERY_FEE, paymentResponsibility: 'customer_paid',
    items: [{ variantId: varD.variantId, action: 'add', quantity: 1 }],
  });

  // Pre-cancel stocks: A=50, B=50, C=50, D=49
  const sA9_pre = await getStock(varA.variantId);
  const sB9_pre = await getStock(varB.variantId);
  const sC9_pre = await getStock(varC.variantId);
  const sD9_pre = await getStock(varD.variantId);
  console.log(`  Pre-cancel: A=${sA9_pre}(50), B=${sB9_pre}(50), C=${sC9_pre}(50), D=${sD9_pre}(49)`);
  assert(sA9_pre === 50, `Test 9: Pre-cancel A should be 50, got ${sA9_pre}`);
  assert(sB9_pre === 50, `Test 9: Pre-cancel B should be 50, got ${sB9_pre}`);
  assert(sC9_pre === 50, `Test 9: Pre-cancel C should be 50, got ${sC9_pre}`);
  assert(sD9_pre === 49, `Test 9: Pre-cancel D should be 49 (active), got ${sD9_pre}`);

  // Cancel → must restore D only
  await orderService.cancelOrder(ord9.id);

  const sA9 = await getStock(varA.variantId);
  const sB9 = await getStock(varB.variantId);
  const sC9 = await getStock(varC.variantId);
  const sD9 = await getStock(varD.variantId);
  console.log(`  Post-cancel: A=${sA9}(50), B=${sB9}(50), C=${sC9}(50), D=${sD9}(50)`);
  assert(sA9 === 50, `Test 9: A should still be 50 — NOT re-restored, got ${sA9}`);
  assert(sB9 === 50, `Test 9: B should still be 50 — NOT re-restored, got ${sB9}`);
  assert(sC9 === 50, `Test 9: C should still be 50 — NOT re-restored, got ${sC9}`);
  assert(sD9 === 50, `Test 9: D should be restored to 50, got ${sD9}`);

  // Verify exchange history intact
  const ord9Fetched = await orderService.getOrderById(ord9.id);
  assert(ord9Fetched.status === 'cancelled', `Test 9: Order should be cancelled`);
  assert(ord9Fetched.exchanges.length === 3, `Test 9: Exchange history should show 3 records, got ${ord9Fetched.exchanges.length}`);
  console.log(`  Exchange history: ${ord9Fetched.exchanges.length} records preserved ✓`);

  // Verify cancelled order contributes 0 to active analytics
  const s9 = await analyticsService.getAnalytics();
  const t9_grossInc = s9.kpi.totalRevenue - base9.kpi.totalRevenue;
  console.log(`  Active gross revenue increment from cancelled order: ${t9_grossInc} (Expected: 0)`);
  assert(t9_grossInc === 0, `Test 9: Cancelled order should contribute 0 to totalRevenue, got ${t9_grossInc}`);
  console.log('  ✓ TEST 9 PASSED!\n');

  // ========================================================================
  // TEST 10 — Mixed exchanges + cancellation
  // Normal → customer-paid exchange → silky-paid exchange → customer-paid exchange → Cancel
  //
  // Verify:
  //   - Every financial event counted exactly once before cancellation.
  //   - After cancellation: active revenue increment = 0.
  //   - No carrier expense duplicated.
  //   - No delivery revenue duplicated.
  //   - Final inventory (D) restored exactly once.
  //   - Historical exchange records preserved.
  // ========================================================================
  console.log('------------------------------------------------------------------------');
  console.log('TEST 10 — Mixed Exchanges + Cancellation');
  console.log('  Normal → Cust-paid → Silky-paid → Cust-paid → Cancel');
  console.log('  Every event counted once; final inventory restored once.');
  console.log('------------------------------------------------------------------------');

  await setStock(varA.variantId, 50);
  await setStock(varB.variantId, 50);
  await setStock(varC.variantId, 50);
  await setStock(varD.variantId, 50);

  const base10 = await analyticsService.getAnalytics();

  const ord10 = await adminService.createManualOrder({
    customerName: 'Client Test Dix', phoneNumber: '90010010', orderSource: 'phone',
    customerEmail: 'T10@test.com', governorate: 'Tunis', shippingAddress: 'Rue Habib Bourguiba',
    deliveryFee: DELIVERY_FEE,
    items: [{ variantId: varA.variantId, quantity: 1 }],
  });
  await orderService.confirmOrder(ord10.id);
  cleanupOrderIds.push(ord10.id);

  // Exchange 1: customer-paid (A → B)
  await exchangeService.createExchange({
    orderId: ord10.id,
    customer: { customerName: 'Client Test Dix', phoneNumber: '90010010', shippingAddress: 'Tunis' },
    deliveryFee: DELIVERY_FEE, paymentResponsibility: 'customer_paid',
    items: [{ variantId: varB.variantId, action: 'add', quantity: 1 }],
  });
  // Exchange 2: silky-paid (B → C)
  await exchangeService.createExchange({
    orderId: ord10.id,
    customer: { customerName: 'Client Test Dix', phoneNumber: '90010010', shippingAddress: 'Tunis' },
    paymentResponsibility: 'silky_paid',
    items: [{ variantId: varC.variantId, action: 'add', quantity: 1 }],
  });
  // Exchange 3: customer-paid (C → D)
  await exchangeService.createExchange({
    orderId: ord10.id,
    customer: { customerName: 'Client Test Dix', phoneNumber: '90010010', shippingAddress: 'Tunis' },
    deliveryFee: DELIVERY_FEE, paymentResponsibility: 'customer_paid',
    items: [{ variantId: varD.variantId, action: 'add', quantity: 1 }],
  });

  // Cancel
  await orderService.cancelOrder(ord10.id);

  // Verify status and history
  const ord10Fetched = await orderService.getOrderById(ord10.id);
  assert(ord10Fetched.status === 'cancelled', 'Test 10: Order should be cancelled');
  assert(ord10Fetched.exchanges.length === 3, `Test 10: Exchange history should show 3 records, got ${ord10Fetched.exchanges.length}`);
  console.log(`  Status: ${ord10Fetched.status} ✓`);
  console.log(`  Exchange history: ${ord10Fetched.exchanges.length} records preserved ✓`);

  // Verify stock: all restored to 50
  const sA10 = await getStock(varA.variantId);
  const sB10 = await getStock(varB.variantId);
  const sC10 = await getStock(varC.variantId);
  const sD10 = await getStock(varD.variantId);
  console.log(`  Final stocks: A=${sA10}(50), B=${sB10}(50), C=${sC10}(50), D=${sD10}(50)`);
  assert(sA10 === 50, `Test 10: A should be 50, got ${sA10}`);
  assert(sB10 === 50, `Test 10: B should be 50, got ${sB10}`);
  assert(sC10 === 50, `Test 10: C should be 50, got ${sC10}`);
  assert(sD10 === 50, `Test 10: D should be 50 (restored exactly once), got ${sD10}`);

  // Verify cancelled order contributes 0 to active analytics
  const s10 = await analyticsService.getAnalytics();
  const t10_grossInc   = s10.kpi.totalRevenue              - base10.kpi.totalRevenue;
  const t10_carrierInc = s10.delivery.deliveryCompanyExpense - base10.delivery.deliveryCompanyExpense;
  console.log(`  Active gross revenue increment: ${t10_grossInc} (Expected: 0)`);
  console.log(`  Carrier expense increment: ${t10_carrierInc} (Expected: 0)`);
  assert(t10_grossInc   === 0, `Test 10: Cancelled order should contribute 0 gross revenue, got ${t10_grossInc}`);
  assert(t10_carrierInc === 0, `Test 10: Cancelled order should contribute 0 carrier expense, got ${t10_carrierInc}`);
  console.log('  ✓ TEST 10 PASSED!\n');

  // ========================================================================
  // FINAL SUMMARY
  // ========================================================================
  console.log('========================================================================');
  if (allPassed) {
    console.log('✅ ALL 10 MASTER BUSINESS SCENARIOS PASSED WITH 100% SUCCESS!');
  } else {
    console.log('❌ SOME TESTS FAILED — see above for details.');
  }
  console.log('========================================================================\n');

  // ── Email-race-safe cleanup ───────────────────────────────────────────────
  // dispatchOrderConfirmationEmail() is fire-and-forget (no await at call
  // sites).  It will try to markSent() the email-delivery row after the test
  // body returns.  If pool.end() fires first, the update throws "pool has been
  // closed".  We poll order_email_deliveries until every pending record for our
  // test orders has settled, then delete the orders and let .finally close the
  // pool.  This does NOT alter any production behavior.
  if (cleanupOrderIds.length > 0) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS pending
         FROM order_email_deliveries
         WHERE order_id = ANY($1::uuid[])
           AND status = 'pending'`,
        [cleanupOrderIds]
      );
      if (Number(rows[0].pending) === 0) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    await pool.query('DELETE FROM orders WHERE id = ANY($1::uuid[])', [cleanupOrderIds]);
  }
}

runMasterAudit()
  .catch((err) => {
    console.error('\n❌ Master Audit Failed:', err.message);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
