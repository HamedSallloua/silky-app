/**
 * Comprehensive Verification Suite for "MONTANT PAYÉ TOTAL" and "MONTANT PAYÉ NET" KPI
 *
 * Scenarios Tested:
 * 1. Normal order (58/58)
 * 2. Customer-paid exchange (76/76)
 * 3. Silky-paid cheaper exchange (76/66)
 * 4. Equal-price customer-paid exchange (50->50 => ex pay = 8)
 * 5. More expensive silky-paid exchange (50->60, delivery=0 => ex pay = 10, total & net +10)
 * 6. Cheaper customer-paid exchange (60->50, delivery=8 => ex pay = 8, silky pays 10, net diff = -2)
 * 7. Free refund (product 50, delivery 0 => total +0, net -50)
 * 8. Customer-paid refund (product 50, delivery 8 => total +8, net -42)
 * 9. Full mixed lifecycle (Order 58 -> Ex1 18 -> Ex2 0 -> Ex3 28 -> Refund 0)
 * 10. Multiple orders simultaneously aggregating correctly
 * 11. Cancelled orders excluded from KPI matching existing analytics policy
 * 12. Refunded orders included and properly accounted for
 * 13. Multiple successive exchanges with sequence ordering (exchange_sequence ASC)
 * 14. Non-regression: customerAmountToPay and existing calculations identical
 */

import '../config/env.js';
import { pool } from '../db/pool.js';
import {
  calculateOrderCustomerAmountToPay,
  calculateExchangeCustomerAmountToPay,
  calculateRefundCustomerAmountToPay,
  orderRepository,
} from '../repositories/order.repository.js';
import * as orderService from '../services/order.service.js';
import * as exchangeService from '../services/exchange.service.js';
import * as analyticsService from '../services/analytics.service.js';
import * as adminService from '../services/admin.service.js';
import * as inventoryService from '../services/inventory.service.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

function assertClose(actual, expected, message) {
  if (Math.abs(Number(actual) - Number(expected)) > 0.001) {
    console.error(`❌ MISMATCH: expected ${expected}, got ${actual}. ${message}`);
    throw new Error(`Expected ${expected}, got ${actual}. ${message}`);
  }
}

// Pure formula simulator mirroring the exact logic
function computeOrderPaidAmounts(order, exchanges = [], refunds = []) {
  const initialPaid = calculateOrderCustomerAmountToPay(order);

  // Sort exchanges by sequence
  const sortedExchangesAsc = [...exchanges].sort((a, b) => {
    const seqA = a.exchangeSequence !== undefined && a.exchangeSequence !== null ? Number(a.exchangeSequence) : 0;
    const seqB = b.exchangeSequence !== undefined && b.exchangeSequence !== null ? Number(b.exchangeSequence) : 0;
    if (seqA !== seqB) return seqA - seqB;
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });

  let runningSubtotal = parseFloat(order.subtotal) || 0;
  let exchangeChargedTotal = 0;
  let exchangeSilkyBackTotal = 0;

  for (const ex of sortedExchangesAsc) {
    const charged = calculateExchangeCustomerAmountToPay(ex, runningSubtotal);
    const newSubtotal = parseFloat(ex.subtotal) || 0;
    const silkyBack = Math.max(0, runningSubtotal - newSubtotal);

    exchangeChargedTotal += charged;
    exchangeSilkyBackTotal += silkyBack;
    runningSubtotal = newSubtotal;
  }

  let refundChargedTotal = 0;
  let refundPaidBackTotal = 0;

  for (const ref of refunds) {
    refundChargedTotal += calculateRefundCustomerAmountToPay(ref);
    refundPaidBackTotal += parseFloat(ref.refundAmount) || 0;
  }

  const montantPayeTotal = initialPaid + exchangeChargedTotal + refundChargedTotal;
  const montantPayeNet = montantPayeTotal - exchangeSilkyBackTotal - refundPaidBackTotal;

  return {
    initialPaid,
    exchangeChargedTotal,
    exchangeSilkyBackTotal,
    refundChargedTotal,
    refundPaidBackTotal,
    montantPayeTotal,
    montantPayeNet,
  };
}

async function runUnitTests() {
  console.log('=======================================================================');
  console.log('SECTION 1: PURE FORMULA SIMULATION TESTS');
  console.log('=======================================================================\n');

  // Scenario A: Normal order A=50, Delivery=8
  const ordA = { subtotal: 50.0, deliveryFee: 8.0, totalAmount: 58.0 };
  const resA = computeOrderPaidAmounts(ordA, [], []);
  assertClose(resA.montantPayeTotal, 58.0, 'Scenario A: Total = 58');
  assertClose(resA.montantPayeNet, 58.0, 'Scenario A: Net = 58');
  console.log(`  ✓ Scenario A Passed: Normal order 50 + 8 => Total=${resA.montantPayeTotal}, Net=${resA.montantPayeNet}`);

  // Scenario B: Customer-paid exchange A 50 -> B 60 (delivery 8)
  const exB = { exchangeSequence: 1, subtotal: 60.0, deliveryFee: 8.0, paymentResponsibility: 'customer_paid' };
  const resB = computeOrderPaidAmounts(ordA, [exB], []);
  assertClose(resB.montantPayeTotal, 76.0, 'Scenario B: Total = 76');
  assertClose(resB.montantPayeNet, 76.0, 'Scenario B: Net = 76');
  console.log(`  ✓ Scenario B Passed: + Customer-paid exchange 50->60 => Total=${resB.montantPayeTotal}, Net=${resB.montantPayeNet}`);

  // Scenario C: Silky-paid cheaper exchange B 60 -> A 50 (delivery 0)
  const exC = { exchangeSequence: 2, subtotal: 50.0, deliveryFee: 0.0, paymentResponsibility: 'silky_paid' };
  const resC = computeOrderPaidAmounts(ordA, [exB, exC], []);
  assertClose(resC.montantPayeTotal, 76.0, 'Scenario C: Total = 76');
  assertClose(resC.montantPayeNet, 66.0, 'Scenario C: Net = 66');
  console.log(`  ✓ Scenario C Passed: + Silky-paid cheaper exchange 60->50 => Total=${resC.montantPayeTotal}, Net=${resC.montantPayeNet}`);

  // Scenario D: Equal-price customer-paid exchange 50 -> 50 (delivery 8)
  const exD = { exchangeSequence: 1, subtotal: 50.0, deliveryFee: 8.0, paymentResponsibility: 'customer_paid' };
  const resD = computeOrderPaidAmounts(ordA, [exD], []);
  assertClose(resD.montantPayeTotal, 66.0, 'Scenario D: Total = 66 (58 + 8)');
  assertClose(resD.montantPayeNet, 66.0, 'Scenario D: Net = 66 (58 + 8)');
  console.log(`  ✓ Scenario D Passed: Equal-price customer-paid exchange 50->50 => Total=${resD.montantPayeTotal}, Net=${resD.montantPayeNet}`);

  // Scenario E: More expensive silky-paid exchange 50 -> 60 (delivery 0)
  const exE = { exchangeSequence: 1, subtotal: 60.0, deliveryFee: 0.0, paymentResponsibility: 'silky_paid' };
  const resE = computeOrderPaidAmounts(ordA, [exE], []);
  assertClose(resE.montantPayeTotal, 68.0, 'Scenario E: Total = 68 (58 + 10)');
  assertClose(resE.montantPayeNet, 68.0, 'Scenario E: Net = 68 (58 + 10)');
  console.log(`  ✓ Scenario E Passed: More expensive silky-paid exchange 50->60 => Total=${resE.montantPayeTotal}, Net=${resE.montantPayeNet}`);

  // Scenario F: Cheaper customer-paid exchange 60 -> 50 (delivery 8) from base 60
  const ord60 = { subtotal: 60.0, deliveryFee: 8.0, totalAmount: 68.0 };
  const exF = { exchangeSequence: 1, subtotal: 50.0, deliveryFee: 8.0, paymentResponsibility: 'customer_paid' };
  const resF = computeOrderPaidAmounts(ord60, [exF], []);
  assertClose(resF.montantPayeTotal, 76.0, 'Scenario F: Total = 76 (68 + 8)');
  assertClose(resF.montantPayeNet, 66.0, 'Scenario F: Net = 66 (68 + 8 - 10)');
  console.log(`  ✓ Scenario F Passed: Cheaper customer-paid exchange 60->50 => Total=${resF.montantPayeTotal}, Net=${resF.montantPayeNet}`);

  // Scenario G: Free refund (refund amount 50, delivery 0)
  const refG = { refundAmount: 50.0, deliveryFee: 0.0, paymentResponsibility: 'silky_paid' };
  const resG = computeOrderPaidAmounts(ordA, [], [refG]);
  assertClose(resG.montantPayeTotal, 58.0, 'Scenario G: Total = 58');
  assertClose(resG.montantPayeNet, 8.0, 'Scenario G: Net = 8 (58 - 50)');
  console.log(`  ✓ Scenario G Passed: Free refund (product 50, fee 0) => Total=${resG.montantPayeTotal}, Net=${resG.montantPayeNet}`);

  // Scenario H: Customer-paid refund (refund amount 50, delivery 8)
  const refH = { refundAmount: 50.0, deliveryFee: 8.0, paymentResponsibility: 'customer_paid' };
  const resH = computeOrderPaidAmounts(ordA, [], [refH]);
  assertClose(resH.montantPayeTotal, 66.0, 'Scenario H: Total = 66 (58 + 8)');
  assertClose(resH.montantPayeNet, 16.0, 'Scenario H: Net = 16 (58 + 8 - 50)');
  console.log(`  ✓ Scenario H Passed: Customer-paid refund (product 50, fee 8) => Total=${resH.montantPayeTotal}, Net=${resH.montantPayeNet}`);

  // Scenario I: Full mixed extended lifecycle
  const ex3 = { exchangeSequence: 3, subtotal: 70.0, deliveryFee: 8.0, paymentResponsibility: 'customer_paid' };
  const resI = computeOrderPaidAmounts(ordA, [exB, exC, ex3], [refG]);
  assertClose(resI.montantPayeTotal, 104.0, 'Scenario I: Total = 104');
  assertClose(resI.montantPayeNet, 44.0, 'Scenario I: Net = 44');
  console.log(`  ✓ Scenario I Passed: Extended mixed lifecycle => Total=${resI.montantPayeTotal}, Net=${resI.montantPayeNet}`);
}

async function runDatabaseIntegrationTests() {
  console.log('\n=======================================================================');
  console.log('SECTION 2: END-TO-END DATABASE & ANALYTICS REPOSITORY TESTS');
  console.log('=======================================================================\n');

  const { rows: variants } = await pool.query(`
    SELECT pv.id, pv.stock_quantity, p.title, p.price, p.discount_amount
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE p.is_active = TRUE
    ORDER BY pv.id
    LIMIT 3
  `);

  if (variants.length < 3) {
    console.error('Test requires at least 3 active variants in DB.');
    process.exit(1);
  }

  const [varA, varB, varC] = variants;
  await inventoryService.updateVariantStock(varA.id, 100);
  await inventoryService.updateVariantStock(varB.id, 100);
  await inventoryService.updateVariantStock(varC.id, 100);

  // Baseline analytics
  const baseline = await analyticsService.getAnalytics();
  const baseTotalPaid = baseline.kpi.montantPayeTotal || 0;
  const baseNetPaid = baseline.kpi.montantPayeNet || 0;

  console.log(`Initial DB Baseline: Montant Payé Total = ${baseTotalPaid.toFixed(3)}, Montant Payé Net = ${baseNetPaid.toFixed(3)}\n`);

  // 1. Create Order 1 (Product A, Delivery = 8)
  const ord1 = await adminService.createManualOrder({
    customerName: 'KPI Test Customer 1',
    phoneNumber: '91110001',
    orderSource: 'phone',
    customerEmail: 'kpi1@example.com',
    governorate: 'Tunis',
    shippingAddress: 'Avenue Habib Bourguiba',
    deliveryFee: 8.0,
    items: [{ variantId: varA.id, quantity: 1 }],
  });
  await orderService.confirmOrder(ord1.id);

  const priceA = parseFloat(ord1.subtotal);
  const deliveryA = parseFloat(ord1.deliveryFee);
  const expectedOrder1Total = priceA + deliveryA;

  let analytics1 = await analyticsService.getAnalytics();
  let deltaTotal1 = analytics1.kpi.montantPayeTotal - baseTotalPaid;
  let deltaNet1 = analytics1.kpi.montantPayeNet - baseNetPaid;

  assertClose(deltaTotal1, expectedOrder1Total, 'Order 1 delta Montant Payé Total');
  assertClose(deltaNet1, expectedOrder1Total, 'Order 1 delta Montant Payé Net');
  console.log(`  ✓ DB Test 1 Passed: New Order (Subtotal ${priceA} + Fee ${deliveryA} = ${expectedOrder1Total})`);
  console.log(`      Delta Total: +${deltaTotal1.toFixed(3)} TND, Delta Net: +${deltaNet1.toFixed(3)} TND`);

  // 2. Exchange 1: varA -> varB (customer_paid, delivery fee 8)
  const priceB = Number(varB.price) - Number(varB.discount_amount);
  const diffB_A = Math.max(0, priceB - priceA);
  const expectedEx1Pay = diffB_A + 8.0;

  await exchangeService.createExchange({
    orderId: ord1.id,
    customer: { customerName: 'KPI Test Customer 1', phoneNumber: '91110001', shippingAddress: 'Tunis' },
    deliveryFee: 8.0,
    paymentResponsibility: 'customer_paid',
    items: [
      { variantId: varA.id, action: 'return', quantity: 1 },
      { variantId: varB.id, action: 'add', quantity: 1 },
    ],
  });

  let analytics2 = await analyticsService.getAnalytics();
  let deltaTotal2 = analytics2.kpi.montantPayeTotal - baseTotalPaid;
  let deltaNet2 = analytics2.kpi.montantPayeNet - baseNetPaid;

  const expectedCumulativeTotal2 = expectedOrder1Total + expectedEx1Pay;
  const expectedCumulativeNet2 = expectedOrder1Total + expectedEx1Pay;

  assertClose(deltaTotal2, expectedCumulativeTotal2, 'After Ex 1: delta Montant Payé Total');
  assertClose(deltaNet2, expectedCumulativeNet2, 'After Ex 1: delta Montant Payé Net');
  console.log(`  ✓ DB Test 2 Passed: After Customer-Paid Exchange #1 (+${expectedEx1Pay.toFixed(3)} TND)`);
  console.log(`      Cumulative Delta Total: +${deltaTotal2.toFixed(3)} TND, Cumulative Delta Net: +${deltaNet2.toFixed(3)} TND`);

  // 3. Exchange 2: varB -> varA (silky_paid, delivery fee 0)
  const diffSilkyBack = Math.max(0, priceB - priceA); // amount Silky pays back to customer

  await exchangeService.createExchange({
    orderId: ord1.id,
    customer: { customerName: 'KPI Test Customer 1', phoneNumber: '91110001', shippingAddress: 'Tunis' },
    deliveryFee: 0.0,
    paymentResponsibility: 'silky_paid',
    items: [
      { variantId: varB.id, action: 'return', quantity: 1 },
      { variantId: varA.id, action: 'add', quantity: 1 },
    ],
  });

  let analytics3 = await analyticsService.getAnalytics();
  let deltaTotal3 = analytics3.kpi.montantPayeTotal - baseTotalPaid;
  let deltaNet3 = analytics3.kpi.montantPayeNet - baseNetPaid;

  const expectedCumulativeTotal3 = expectedCumulativeTotal2 + 0; // customer pays 0
  const expectedCumulativeNet3 = expectedCumulativeNet2 - diffSilkyBack; // Net subtracts Silky back payment

  assertClose(deltaTotal3, expectedCumulativeTotal3, 'After Ex 2: delta Montant Payé Total');
  assertClose(deltaNet3, expectedCumulativeNet3, 'After Ex 2: delta Montant Payé Net');
  console.log(`  ✓ DB Test 3 Passed: After Silky-Paid Cheaper Exchange #2 (Customer pays 0, Silky pays ${diffSilkyBack.toFixed(3)})`);
  console.log(`      Cumulative Delta Total: +${deltaTotal3.toFixed(3)} TND, Cumulative Delta Net: +${deltaNet3.toFixed(3)} TND`);

  // 4. Refund: Silky-paid / free refund of active item (priceA)
  await orderService.refundOrder(ord1.id, {
    customerName: 'KPI Test Customer 1',
    phoneNumber: '91110001',
    shippingAddress: 'Tunis',
    deliveryFee: 0.0,
    carrierCost: 7.0,
    paymentResponsibility: 'silky_paid',
    items: [{ variantId: varA.id, quantity: 1, unitPrice: priceA }],
  });

  let analytics4 = await analyticsService.getAnalytics();
  let deltaTotal4 = analytics4.kpi.montantPayeTotal - baseTotalPaid;
  let deltaNet4 = analytics4.kpi.montantPayeNet - baseNetPaid;

  const expectedCumulativeTotal4 = expectedCumulativeTotal3 + 0; // refund fee is 0
  const expectedCumulativeNet4 = expectedCumulativeNet3 - priceA; // refund amount subtracted

  assertClose(deltaTotal4, expectedCumulativeTotal4, 'After Refund: delta Montant Payé Total');
  assertClose(deltaNet4, expectedCumulativeNet4, 'After Refund: delta Montant Payé Net');
  console.log(`  ✓ DB Test 4 Passed: After Free Refund of Product A (${priceA.toFixed(3)} TND)`);
  console.log(`      Cumulative Delta Total: +${deltaTotal4.toFixed(3)} TND, Cumulative Delta Net: +${deltaNet4.toFixed(3)} TND`);

  // 5. Multiple Orders Test: Create Order 2 and verify aggregation across both orders
  const ord2 = await adminService.createManualOrder({
    customerName: 'KPI Test Customer 2',
    phoneNumber: '91110002',
    orderSource: 'phone',
    customerEmail: 'kpi2@example.com',
    governorate: 'Sfax',
    shippingAddress: 'Route de Téniour',
    deliveryFee: 8.0,
    items: [{ variantId: varC.id, quantity: 1 }],
  });
  await orderService.confirmOrder(ord2.id);

  const priceC = parseFloat(ord2.subtotal);
  const deliveryC = parseFloat(ord2.deliveryFee);
  const expectedOrder2Total = priceC + deliveryC;

  let analyticsMulti = await analyticsService.getAnalytics();
  let deltaTotalMulti = analyticsMulti.kpi.montantPayeTotal - baseTotalPaid;
  let deltaNetMulti = analyticsMulti.kpi.montantPayeNet - baseNetPaid;

  assertClose(deltaTotalMulti, expectedCumulativeTotal4 + expectedOrder2Total, 'Multiple orders: Montant Payé Total');
  assertClose(deltaNetMulti, expectedCumulativeNet4 + expectedOrder2Total, 'Multiple orders: Montant Payé Net');
  console.log(`  ✓ DB Test 5 Passed: Multiple Orders simultaneously aggregate correctly.`);

  // 6. Cancelled Order Test: Create an order and cancel it -> should NOT affect KPI
  const ordCancel = await adminService.createManualOrder({
    customerName: 'KPI Cancelled Customer',
    phoneNumber: '91110009',
    orderSource: 'phone',
    customerEmail: 'cancel@example.com',
    governorate: 'Sousse',
    shippingAddress: 'Boulevard 14 Janvier',
    deliveryFee: 8.0,
    items: [{ variantId: varA.id, quantity: 2 }],
  });
  await orderService.cancelOrder(ordCancel.id);

  let analyticsCancel = await analyticsService.getAnalytics();
  let deltaTotalCancel = analyticsCancel.kpi.montantPayeTotal - baseTotalPaid;
  let deltaNetCancel = analyticsCancel.kpi.montantPayeNet - baseNetPaid;

  assertClose(deltaTotalCancel, deltaTotalMulti, 'Cancelled order must not affect Montant Payé Total');
  assertClose(deltaNetCancel, deltaNetMulti, 'Cancelled order must not affect Montant Payé Net');
  console.log(`  ✓ DB Test 6 Passed: Cancelled Order excluded from KPI calculations.`);

  // Clean up test orders
  await pool.query(`DELETE FROM orders WHERE id IN ($1, $2, $3)`, [ord1.id, ord2.id, ordCancel.id]);
  console.log(`  ✓ Cleaned up test orders.`);
}

async function runNonRegressionVerification() {
  console.log('\n=======================================================================');
  console.log('SECTION 3: NON-REGRESSION & REPOSITORY VALUE IDENTICALITY TESTS');
  console.log('=======================================================================\n');

  // Verify that calculateOrderCustomerAmountToPay is identical
  const orderMock = { totalAmount: '58.000', subtotal: '50.000', deliveryFee: '8.000' };
  assertClose(calculateOrderCustomerAmountToPay(orderMock), 58.0, 'calculateOrderCustomerAmountToPay unchanged');
  console.log('  ✓ calculateOrderCustomerAmountToPay verified unchanged.');

  // Verify calculateExchangeCustomerAmountToPay is identical
  const exMock = { subtotal: '60.000', deliveryFee: '8.000' };
  assertClose(calculateExchangeCustomerAmountToPay(exMock, 50.0), 18.0, 'calculateExchangeCustomerAmountToPay unchanged');
  console.log('  ✓ calculateExchangeCustomerAmountToPay verified unchanged.');

  // Verify calculateRefundCustomerAmountToPay is identical
  const refMock = { deliveryFee: '8.000' };
  assertClose(calculateRefundCustomerAmountToPay(refMock), 8.0, 'calculateRefundCustomerAmountToPay unchanged');
  console.log('  ✓ calculateRefundCustomerAmountToPay verified unchanged.');
}

async function main() {
  try {
    await runUnitTests();
    await runDatabaseIntegrationTests();
    await runNonRegressionVerification();

    console.log('\n=======================================================================');
    console.log('✅ ALL 14 KPI TEST SCENARIOS PASSED WITH 100% SUCCESS!');
    console.log('=======================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
  }
}

main();
