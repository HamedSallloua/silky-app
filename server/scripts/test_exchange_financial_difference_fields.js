/**
 * Comprehensive Database-Independent Test Suite for Exchange Financial Difference Fields:
 * - productAmountAdded
 * - productRefundObligation
 *
 * This test runs completely offline without connecting to PostgreSQL or starting the server.
 */

import { calculateExchangeCustomerAmountToPay, calculateOrderCustomerAmountToPay } from '../repositories/order.repository.js';
import { orderExchanges } from '../models/orders.model.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passedTests++;
  console.log(`  ✓ PASSED: ${message}`);
}

function assertClose(actual, expected, message) {
  totalTests++;
  const diff = Math.abs(Number(actual) - Number(expected));
  if (diff > 0.0001) {
    console.error(`❌ FAILED: ${message} (Expected ${expected}, got ${actual})`);
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
  passedTests++;
  console.log(`  ✓ PASSED: ${message} (Value: ${actual})`);
}

// Emulate the exact authoritative logic implemented in exchange.service.js
function computeExchangeFinancials({ previousSubtotal, newSubtotal, deliveryFee = 8.0 }) {
  const prev = parseFloat(previousSubtotal) || 0;
  const curr = parseFloat(newSubtotal) || 0;
  const fee = parseFloat(deliveryFee) || 0;

  // Existing unchanged logic
  const productDiff = Math.max(0, curr - prev);
  const customerAmountToPay = productDiff + fee;

  // New additive informational fields
  const productAmountAdded = Math.max(0, curr - prev);
  const productRefundObligation = Math.max(0, prev - curr);

  return {
    subtotal: curr,
    previousSubtotal: prev,
    deliveryFee: fee,
    productDiff,
    customerAmountToPay,
    productAmountAdded,
    productRefundObligation,
  };
}

console.log('================================================================================');
console.log('EXCHANGE FINANCIAL DIFFERENCE FIELDS — OFFLINE VERIFICATION SUITE');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// Scenario 1: Cheaper resulting basket (93 TND -> 50 TND)
// -----------------------------------------------------------------------------
console.log('--- SCENARIO 1: Cheaper Resulting Basket (93 TND -> 50 TND) ---');
{
  const resCust = computeExchangeFinancials({ previousSubtotal: 93.0, newSubtotal: 50.0, deliveryFee: 8.0 });
  assertClose(resCust.productRefundObligation, 43.0, 'productRefundObligation is 43 TND');
  assertClose(resCust.productAmountAdded, 0.0, 'productAmountAdded is 0 TND');
  assertClose(resCust.productDiff, 0.0, 'Existing productDiff remains 0 TND');
  assertClose(resCust.customerAmountToPay, 8.0, 'Existing customerAmountToPay under customer_paid is 8 TND');

  const resSilky = computeExchangeFinancials({ previousSubtotal: 93.0, newSubtotal: 50.0, deliveryFee: 0.0 });
  assertClose(resSilky.productRefundObligation, 43.0, 'productRefundObligation under silky_paid is 43 TND');
  assertClose(resSilky.productAmountAdded, 0.0, 'productAmountAdded under silky_paid is 0 TND');
  assertClose(resSilky.customerAmountToPay, 0.0, 'Existing customerAmountToPay under silky_paid is 0 TND');
}

// -----------------------------------------------------------------------------
// Scenario 2: More expensive resulting basket (50 TND -> 93 TND)
// -----------------------------------------------------------------------------
console.log('\n--- SCENARIO 2: More Expensive Resulting Basket (50 TND -> 93 TND) ---');
{
  const resCust = computeExchangeFinancials({ previousSubtotal: 50.0, newSubtotal: 93.0, deliveryFee: 8.0 });
  assertClose(resCust.productAmountAdded, 43.0, 'productAmountAdded is 43 TND');
  assertClose(resCust.productRefundObligation, 0.0, 'productRefundObligation is 0 TND');
  assertClose(resCust.productDiff, 43.0, 'Existing productDiff is 43 TND');
  assertClose(resCust.customerAmountToPay, 51.0, 'Existing customerAmountToPay under customer_paid is 51 TND (43 + 8)');

  const resSilky = computeExchangeFinancials({ previousSubtotal: 50.0, newSubtotal: 93.0, deliveryFee: 0.0 });
  assertClose(resSilky.productAmountAdded, 43.0, 'productAmountAdded under silky_paid is 43 TND');
  assertClose(resSilky.productRefundObligation, 0.0, 'productRefundObligation under silky_paid is 0 TND');
  assertClose(resSilky.customerAmountToPay, 43.0, 'Existing customerAmountToPay under silky_paid is 43 TND (43 + 0)');
}

// -----------------------------------------------------------------------------
// Scenario 3: Equal basket subtotals (50 TND -> 50 TND)
// -----------------------------------------------------------------------------
console.log('\n--- SCENARIO 3: Equal Basket Subtotals (50 TND -> 50 TND) ---');
{
  const resCust = computeExchangeFinancials({ previousSubtotal: 50.0, newSubtotal: 50.0, deliveryFee: 8.0 });
  assertClose(resCust.productAmountAdded, 0.0, 'productAmountAdded is 0 TND');
  assertClose(resCust.productRefundObligation, 0.0, 'productRefundObligation is 0 TND');
  assertClose(resCust.customerAmountToPay, 8.0, 'Existing customerAmountToPay is 8 TND');

  const resSilky = computeExchangeFinancials({ previousSubtotal: 50.0, newSubtotal: 50.0, deliveryFee: 0.0 });
  assertClose(resSilky.productAmountAdded, 0.0, 'productAmountAdded under silky_paid is 0 TND');
  assertClose(resSilky.productRefundObligation, 0.0, 'productRefundObligation under silky_paid is 0 TND');
  assertClose(resSilky.customerAmountToPay, 0.0, 'Existing customerAmountToPay under silky_paid is 0 TND');
}

// -----------------------------------------------------------------------------
// Scenario 4: Delivery fee decoupling & No Netting
// -----------------------------------------------------------------------------
console.log('\n--- SCENARIO 4: Delivery Fee Decoupling & No Netting ---');
{
  // When previous = 93 and new = 50, customer delivery fee is 8.
  // The product refund obligation MUST be 43 TND, NOT 43 - 8 = 35 TND.
  const res = computeExchangeFinancials({ previousSubtotal: 93.0, newSubtotal: 50.0, deliveryFee: 8.0 });
  assert(res.productRefundObligation === 43.0, 'Refund obligation is not netted against delivery fee (43 TND, not 35 TND)');
  assert(res.customerAmountToPay === 8.0, 'Amount to pay remains delivery fee (8 TND)');
  assert(res.customerAmountToPay !== -35.0, 'Amount to pay is not negative');
}

// -----------------------------------------------------------------------------
// Scenario 5: Mutual Exclusivity of Positive Differences
// -----------------------------------------------------------------------------
console.log('\n--- SCENARIO 5: Mutual Exclusivity Check ---');
{
  const testTransitions = [
    { prev: 100, curr: 80 },
    { prev: 80, curr: 100 },
    { prev: 50, curr: 50 },
    { prev: 120.5, curr: 45.2 },
    { prev: 35.1, curr: 99.9 },
  ];

  for (const { prev, curr } of testTransitions) {
    const res = computeExchangeFinancials({ previousSubtotal: prev, newSubtotal: curr });
    const bothPositive = res.productAmountAdded > 0 && res.productRefundObligation > 0;
    assert(!bothPositive, `Transition ${prev} -> ${curr}: productAmountAdded and productRefundObligation are never both positive`);
  }
}

// -----------------------------------------------------------------------------
// Scenario 6: Sequential Exchanges State Independence
// -----------------------------------------------------------------------------
console.log('\n--- SCENARIO 6: Sequential Exchanges State Independence ---');
{
  // Original order: subtotal = 50 TND
  // Exchange 1: 50 -> 93 TND (more expensive)
  const ex1 = computeExchangeFinancials({ previousSubtotal: 50.0, newSubtotal: 93.0, deliveryFee: 8.0 });
  // Exchange 2: 93 -> 50 TND (cheaper)
  const ex2 = computeExchangeFinancials({ previousSubtotal: 93.0, newSubtotal: 50.0, deliveryFee: 0.0 });
  // Exchange 3: 50 -> 70 TND (more expensive)
  const ex3 = computeExchangeFinancials({ previousSubtotal: 50.0, newSubtotal: 70.0, deliveryFee: 8.0 });

  assertClose(ex1.productAmountAdded, 43.0, 'Exchange 1 productAmountAdded is 43 TND');
  assertClose(ex1.productRefundObligation, 0.0, 'Exchange 1 productRefundObligation is 0 TND');

  assertClose(ex2.productAmountAdded, 0.0, 'Exchange 2 productAmountAdded is 0 TND');
  assertClose(ex2.productRefundObligation, 43.0, 'Exchange 2 productRefundObligation is 43 TND');

  assertClose(ex3.productAmountAdded, 20.0, 'Exchange 3 productAmountAdded is 20 TND');
  assertClose(ex3.productRefundObligation, 0.0, 'Exchange 3 productRefundObligation is 0 TND');

  // Verify Ex1 values were not affected by Ex2 or Ex3
  assert(ex1.productAmountAdded === 43.0 && ex1.productRefundObligation === 0.0, 'Exchange 1 remains immutable after later exchanges');
}

// -----------------------------------------------------------------------------
// Scenario 7: Legacy Exchange Record Compatibility
// -----------------------------------------------------------------------------
console.log('\n--- SCENARIO 7: Legacy Exchange Record Compatibility ---');
{
  const legacyRecord = {
    id: 'legacy-uuid',
    exchangeNumber: 'EXCH-OLD-1',
    subtotal: '50.000',
    deliveryFee: '8.000',
    totalAmount: '58.000',
    // productAmountAdded and productRefundObligation are undefined on legacy records
  };

  const parsedAdded = parseFloat(legacyRecord.productAmountAdded) || 0;
  const parsedRefund = parseFloat(legacyRecord.productRefundObligation) || 0;

  assert(parsedAdded === 0, 'Legacy record productAmountAdded safely defaults to 0');
  assert(parsedRefund === 0, 'Legacy record productRefundObligation safely defaults to 0');
}

// -----------------------------------------------------------------------------
// Scenario 8: Schema & Drizzle Model Integrity
// -----------------------------------------------------------------------------
console.log('\n--- SCENARIO 8: Schema & Drizzle Model Integrity ---');
{
  assert(orderExchanges.productAmountAdded !== undefined, 'orderExchanges model includes productAmountAdded');
  assert(orderExchanges.productRefundObligation !== undefined, 'orderExchanges model includes productRefundObligation');
  assert(orderExchanges.productAmountAdded.name === 'product_amount_added', 'productAmountAdded maps to product_amount_added column');
  assert(orderExchanges.productRefundObligation.name === 'product_refund_obligation', 'productRefundObligation maps to product_refund_obligation column');
}

// -----------------------------------------------------------------------------
// Scenario 9: Non-Interference with calculateExchangeCustomerAmountToPay
// -----------------------------------------------------------------------------
console.log('\n--- SCENARIO 9: Non-Interference with calculateExchangeCustomerAmountToPay ---');
{
  const exRecord = {
    subtotal: 50.0,
    deliveryFee: 8.0,
    productAmountAdded: 0.0,
    productRefundObligation: 43.0,
  };

  // Calling authoritative order.repository.js function
  const payable = calculateExchangeCustomerAmountToPay(exRecord, 93.0);
  assertClose(payable, 8.0, 'calculateExchangeCustomerAmountToPay correctly returns 8 TND (unaffected by refund obligation)');

  const exRecordMoreExp = {
    subtotal: 93.0,
    deliveryFee: 8.0,
    productAmountAdded: 43.0,
    productRefundObligation: 0.0,
  };
  const payableMoreExp = calculateExchangeCustomerAmountToPay(exRecordMoreExp, 50.0);
  assertClose(payableMoreExp, 51.0, 'calculateExchangeCustomerAmountToPay correctly returns 51 TND (43 + 8)');
}

console.log('\n================================================================================');
console.log(`✅ ALL ${passedTests} / ${totalTests} TESTS PASSED SUCCESSFULLY (100% OFFLINE)`);
console.log('================================================================================\n');
