/**
 * Authoritative Verification Suite for finalCustomerPayableAmount ('Montant à payer')
 *
 * Scenarios tested:
 * 1. Normal order (Original product amount + original customer delivery fee)
 * 2. Customer-paid exchange (+8 TND customer delivery fee)
 * 3. Silky-paid exchange (+0 TND, Silky carrier expense not added)
 * 4. Multiple customer-paid exchanges (Cumulative +8 + 8 TND)
 * 5. Multiple silky-paid exchanges (Silky carrier costs excluded)
 * 6. Mixed customer-paid and silky-paid exchange chain
 * 7. Customer-paid refund (-refundAmount + 8 TND customer return delivery fee)
 * 8. Silky-paid / free refund (-refundAmount + 0 TND, 7 TND carrier expense excluded)
 * 9. Exchange chain followed by refund (Cumulative across complete lifecycle)
 * 10. Historical exchange PDF snapshot integrity (Exchange 1 unchanged after Exchange 2)
 * 11. Historical exchange PDF snapshot with later refund (Exchange PDF excludes later refund)
 * 12. Historical refund PDF snapshot integrity (Refund 1 unchanged after later lifecycle events)
 * 13. Current order details view (Shows final cumulative amount after all lifecycle events)
 */

import '../config/env.js';
import { pool } from '../db/pool.js';
import { orderRepository } from '../repositories/order.repository.js';
import * as orderService from '../services/order.service.js';
import * as exchangeService from '../services/exchange.service.js';
import * as inventoryService from '../services/inventory.service.js';

async function run() {
  console.log('=======================================================================');
  console.log('AUTHORITATIVE FINAL CUSTOMER PAYABLE AMOUNT TEST SUITE');
  console.log('======================================================================\n');

  const { rows: variantRows } = await pool.query(`
    SELECT
      p.id AS product_id, p.title,
      (p.price - p.discount_amount) AS effective_price,
      pv.id AS variant_id, pv.sku, pv.stock_quantity
    FROM products p
    JOIN product_variants pv ON pv.product_id = p.id
    WHERE p.is_active = TRUE
    ORDER BY p.price DESC, p.id, pv.id
    LIMIT 3
  `);

  if (variantRows.length < 3) {
    console.error('Test requires at least 3 active variants in DB.');
    process.exit(1);
  }

  const vA = { variantId: variantRows[0].variant_id, productId: variantRows[0].product_id, name: variantRows[0].title, price: Number(variantRows[0].effective_price) };
  const vB = { variantId: variantRows[1].variant_id, productId: variantRows[1].product_id, name: variantRows[1].title, price: Number(variantRows[1].effective_price) };
  const vC = { variantId: variantRows[2].variant_id, productId: variantRows[2].product_id, name: variantRows[2].title, price: Number(variantRows[2].effective_price) };

  await inventoryService.updateVariantStock(vA.variantId, 100);
  await inventoryService.updateVariantStock(vB.variantId, 100);
  await inventoryService.updateVariantStock(vC.variantId, 100);

  console.log(`Test Products:`);
  console.log(`  Variant A: ${vA.name} @ ${vA.price} TND`);
  console.log(`  Variant B: ${vB.name} @ ${vB.price} TND`);
  console.log(`  Variant C: ${vC.name} @ ${vC.price} TND\n`);

  const customerBase = {
    name: 'Test FinalPayable Customer',
    phone: '21000999',
    email: 'payable.test@example.com',
    address: 'Tunis — 1000 Rue de la République',
  };

  // Scenario 1
  console.log('--- SCENARIO 1: Normal Order ---');
  const order1 = await orderService.createOrder({
    customer: { ...customerBase },
    items: [{ variantId: vA.variantId, quantity: 2, price: vA.price }],
    deliveryFee: 8.0,
  });
  await orderService.confirmOrder(order1.id);
  const fetchedOrder1 = await orderRepository.findById(order1.id);
  const expectedOrder1Payable = (vA.price * 2) + 8.0;
  if (Math.abs(fetchedOrder1.finalCustomerPayableAmount - expectedOrder1Payable) > 0.001) {
    throw new Error('Scenario 1 failed');
  }
  console.log(`  ✓ Scenario 1 Passed: Normal order = ${fetchedOrder1.finalCustomerPayableAmount.toFixed(3)} TND`);

  // Scenario 2
  console.log('\n--- SCENARIO 2: Customer-Paid Exchange ---');
  const order2 = await orderService.createOrder({
    customer: { ...customerBase },
    items: [{ variantId: vA.variantId, quantity: 1, price: vA.price }],
    deliveryFee: 8.0,
  });
  await orderService.confirmOrder(order2.id);
  await exchangeService.createExchange({
    orderId: order2.id,
    customer: { customerName: customerBase.name, phoneNumber: customerBase.phone, shippingAddress: customerBase.address },
    items: [
      { variantId: vA.variantId, action: 'replace', quantity: 1 },
      { variantId: vB.variantId, action: 'add', quantity: 1 },
    ],
    deliveryFee: 8.0,
    paymentResponsibility: 'customer_paid',
  });
  const fetchedOrder2 = await orderRepository.findById(order2.id);
  const expectedOrder2Payable = (vA.price * 1 + 8.0) + 8.0;
  if (Math.abs(fetchedOrder2.finalCustomerPayableAmount - expectedOrder2Payable) > 0.001) {
    throw new Error('Scenario 2 failed');
  }
  if (Math.abs(fetchedOrder2.exchanges[0].finalCustomerPayableAmount - expectedOrder2Payable) > 0.001) {
    throw new Error('Scenario 2 exchange snapshot failed');
  }
  console.log(`  ✓ Scenario 2 Passed: Customer-paid exchange = ${fetchedOrder2.finalCustomerPayableAmount.toFixed(3)} TND`);

  // Scenario 3
  console.log('\n--- SCENARIO 3: Silky-Paid Exchange ---');
  const order3 = await orderService.createOrder({
    customer: { ...customerBase },
    items: [{ variantId: vA.variantId, quantity: 1, price: vA.price }],
    deliveryFee: 8.0,
  });
  await orderService.confirmOrder(order3.id);
  await exchangeService.createExchange({
    orderId: order3.id,
    customer: { customerName: customerBase.name, phoneNumber: customerBase.phone, shippingAddress: customerBase.address },
    items: [
      { variantId: vA.variantId, action: 'replace', quantity: 1 },
      { variantId: vB.variantId, action: 'add', quantity: 1 },
    ],
    deliveryFee: 0.0,
    paymentResponsibility: 'silky_paid',
  });
  const fetchedOrder3 = await orderRepository.findById(order3.id);
  const expectedOrder3Payable = (vA.price * 1 + 8.0) + 0.0;
  if (Math.abs(fetchedOrder3.finalCustomerPayableAmount - expectedOrder3Payable) > 0.001) {
    throw new Error('Scenario 3 failed');
  }
  if (Math.abs(fetchedOrder3.exchanges[0].finalCustomerPayableAmount - expectedOrder3Payable) > 0.001) {
    throw new Error('Scenario 3 exchange snapshot failed');
  }
  console.log('  ✓ Scenario 3 Passed: Silky-paid exchange = ' + fetchedOrder3.finalCustomerPayableAmount.toFixed(3) + ' TND');

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Multiple Customer-Paid Exchanges
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 4: Multiple Customer-Paid Exchanges ---');
  const order4 = await orderService.createOrder({
    customer: { ...customerBase },
    items: [{ variantId: vA.variantId, quantity: 1, price: vA.price }],
    deliveryFee: 8.0,
  });
  await orderService.confirmOrder(order4.id);

  // Exchange 1 (customer_paid)
  await exchangeService.createExchange({
    orderId: order4.id,
    customer: { customerName: customerBase.name, phoneNumber: customerBase.phone, shippingAddress: customerBase.address },
    items: [
      { variantId: vA.variantId, action: 'return', quantity: 1 },
      { variantId: vB.variantId, action: 'add', quantity: 1 },
    ],
    deliveryFee: 8.0,
    paymentResponsibility: 'customer_paid',
  });

  // Exchange 2 (customer_paid)
  await exchangeService.createExchange({
    orderId: order4.id,
    customer: { customerName: customerBase.name, phoneNumber: customerBase.phone, shippingAddress: customerBase.address },
    items: [
      { variantId: vB.variantId, action: 'return', quantity: 1 },
      { variantId: vC.variantId, action: 'add', quantity: 1 },
    ],
    deliveryFee: 8.0,
    paymentResponsibility: 'customer_paid',
  });

  const fetchedOrder4 = await orderRepository.findById(order4.id);
  const expectedOrder4Payable = (vA.price * 1 + 8.0) + 8.0 + 8.0;
  if (Math.abs(fetchedOrder4.finalCustomerPayableAmount - expectedOrder4Payable) > 0.001) {
    throw new Error('Scenario 4 failed');
  }
  console.log(`  ✓ Scenario 4 Passed: Multiple customer-paid exchanges = ${fetchedOrder4.finalCustomerPayableAmount.toFixed(3)} TND`);

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Multiple Silky-Paid Exchanges
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 5: Multiple Silky-Paid Exchanges ---');
  const order5 = await orderService.createOrder({
    customer: { ...customerBase },
    items: [{ variantId: vA.variantId, quantity: 1, price: vA.price }],
    deliveryFee: 8.0,
  });
  await orderService.confirmOrder(order5.id);

  // Exchange 1 (silky_paid)
  await exchangeService.createExchange({
    orderId: order5.id,
    customer: { customerName: customerBase.name, phoneNumber: customerBase.phone, shippingAddress: customerBase.address },
    items: [
      { variantId: vA.variantId, action: 'return', quantity: 1 },
      { variantId: vB.variantId, action: 'add', quantity: 1 },
    ],
    deliveryFee: 0.0,
    paymentResponsibility: 'silky_paid',
  });

  // Exchange 2 (silky_paid)
  await exchangeService.createExchange({
    orderId: order5.id,
    customer: { customerName: customerBase.name, phoneNumber: customerBase.phone, shippingAddress: customerBase.address },
    items: [
      { variantId: vB.variantId, action: 'return', quantity: 1 },
      { variantId: vC.variantId, action: 'add', quantity: 1 },
    ],
    deliveryFee: 0.0,
    paymentResponsibility: 'silky_paid',
  });

  const fetchedOrder5 = await orderRepository.findById(order5.id);
  const expectedOrder5Payable = (vA.price * 1 + 8.0) + 0.0 + 0.0;
  if (Math.abs(fetchedOrder5.finalCustomerPayableAmount - expectedOrder5Payable) > 0.001) {
    throw new Error('Scenario 5 failed');
  }
  console.log(`  ✓ Scenario 5 Passed: Multiple silky-paid exchanges = ${fetchedOrder5.finalCustomerPayableAmount.toFixed(3)} TND`);

  // ---------------------------------------------------------------------------
  // SCENARIOS 6, 9, 10, 11, 12, 13: Full Lifecycle, Mixed Chain & Snapshot Integrity
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIOS 6, 9, 10, 11, 12, 13: Full Lifecycle, Mixed Chain & Snapshots ---');
  const mpOrder = await orderService.createOrder({
    customer: { ...customerBase },
    items: [{ variantId: vA.variantId, quantity: 1, price: vA.price }],
    deliveryFee: 8.0,
  });
  await orderService.confirmOrder(mpOrder.id);

  // Exch 1 (customer_paid: replace vA with vB), timestamp t1
  await new Promise(r => setTimeout(r, 60));
  await exchangeService.createExchange({
    orderId: mpOrder.id,
    customer: { customerName: customerBase.name, phoneNumber: customerBase.phone, shippingAddress: customerBase.address },
    items: [
      { variantId: vA.variantId, action: 'return', quantity: 1 },
      { variantId: vB.variantId, action: 'add', quantity: 1 },
    ],
    deliveryFee: 8.0,
    paymentResponsibility: 'customer_paid',
  });

  const exp1 = (vA.price + 8.0) + 8.0;
  const afterEx1 = await orderRepository.findById(mpOrder.id);
  if (Math.abs(afterEx1.exchanges[0].finalCustomerPayableAmount - exp1) > 0.001) throw new Error('Exch 1 payable mismatch');

  // Exch 2 (silky_paid: replace vB with vC), timestamp t2
  await new Promise(r => setTimeout(r, 60));
  await exchangeService.createExchange({
    orderId: mpOrder.id,
    customer: { customerName: customerBase.name, phoneNumber: customerBase.phone, shippingAddress: customerBase.address },
    items: [
      { variantId: vB.variantId, action: 'return', quantity: 1 },
      { variantId: vC.variantId, action: 'add', quantity: 1 },
    ],
    deliveryFee: 0.0,
    paymentResponsibility: 'silky_paid',
  });

  const exp2 = exp1 + 0.0;
  const afterEx2 = await orderRepository.findById(mpOrder.id);
  const e1InEx2 = afterEx2.exchanges.find(e => e.exchangeSequence === 1);
  const e2InEx2 = afterEx2.exchanges.find(e => e.exchangeSequence === 2);
  if (Math.abs(e1InEx2.finalCustomerPayableAmount - exp1) > 0.001) {
    throw new Error('Exchange 1 snapshot was altered after Exchange 2!');
  }
  if (Math.abs(e2InEx2.finalCustomerPayableAmount - exp2) > 0.001) {
    throw new Error('Exchange 2 snapshot incorrect!');
  }
  console.log('  ✓ Scenario 10 Passed: Exchange 1 snapshot immutable after Exchange 2');

  // Exch 3 (customer_paid: replace vC with vA), timestamp t3
  await new Promise(r => setTimeout(r, 60));
  await exchangeService.createExchange({
    orderId: mpOrder.id,
    customer: { customerName: customerBase.name, phoneNumber: customerBase.phone, shippingAddress: customerBase.address },
    items: [
      { variantId: vC.variantId, action: 'return', quantity: 1 },
      { variantId: vA.variantId, action: 'add', quantity: 1 },
    ],
    deliveryFee: 8.0,
    paymentResponsibility: 'customer_paid',
  });

  const exp3 = exp2 + 8.0;
  const afterEx3 = await orderRepository.findById(mpOrder.id);
  if (Math.abs(afterEx3.finalCustomerPayableAmount - exp3) > 0.001) throw new Error('Mixed chain order payable mismatch');
  console.log(`  ✓ Scenario 6 Passed: Mixed exchange chain = ${afterEx3.finalCustomerPayableAmount.toFixed(3)} TND`);

  // Refund (customer_paid: refund active product vA @ vA.price, customer return delivery fee = 8 TND), timestamp t4
  await new Promise(r => setTimeout(r, 60));
  await orderService.refundOrder(mpOrder.id, { paymentResponsibility: 'customer_paid' });

  const finalOrder = await orderRepository.findById(mpOrder.id);
  const expfinal = exp3 - vA.price + 8.0; // (50 + 8) + 8 + 0 + 8 - 50 + 8 = 32 TND (3 customer deliveries * 8 + 1 initial delivery * 8 = 32)
  if (Math.abs(finalOrder.finalCustomerPayableAmount - expfinal) > 0.001) {
    throw new Error(`Scenario 9 or 13 mismatch: expected ${expfinal}, got ${finalOrder.finalCustomerPayableAmount}`);
  }
  console.log(`  ✓ Scenario 9 & 13 Passed: Final cumulative order payable = ${finalOrder.finalCustomerPayableAmount.toFixed(3)} TND`);

  // Check all historical snapshots in this finalOrder
  const finalE1 = finalOrder.exchanges.find(e => e.exchangeSequence === 1);
  const finalE2 = finalOrder.exchanges.find(e => e.exchangeSequence === 2);
  const finalE3 = finalOrder.exchanges.find(e => e.exchangeSequence === 3);
  const finalR1 = finalOrder.refunds[0];

  if (Math.abs(finalE1.finalCustomerPayableAmount - exp1) > 0.001) throw new Error('Exchange 1 snapshot tainted by later refund!');
  if (Math.abs(finalE2.finalCustomerPayableAmount - exp2) > 0.001) throw new Error('Exchange 2 snapshot tainted by later refund!');
  if (Math.abs(finalE3.finalCustomerPayableAmount - exp3) > 0.001) throw new Error('Exchange 3 snapshot tainted by later refund!');
  if (Math.abs(finalR1.finalCustomerPayableAmount - expfinal) > 0.001) throw new Error('Refund 1 snapshot incorrect!');

  console.log('  ✓ Scenario 11 & 12 Passed: Exchange PDF snapshots exclude later refunds, Refund snapshot is perfectly accurate');

  // ---------------------------------------------------------------------------
  // SCENARIOS 7 & 8: Dedicated Customer-Paid and Silky-Paid Refund Tests
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 7: Dedicated Customer-Paid Refund ---');
  const order7 = await orderService.createOrder({
    customer: { ...customerBase },
    items: [{ variantId: vA.variantId, quantity: 1, price: vA.price }],
    deliveryFee: 8.0,
  });
  await orderService.confirmOrder(order7.id);
  await orderService.refundOrder(order7.id, { paymentResponsibility: 'customer_paid' });
  const fetchedOrder7 = await orderRepository.findById(order7.id);
  const expectedOrder7Payable = (vA.price + 8.0) - vA.price + 8.0; // 16 TND (initial delivery + return delivery fee)
  if (Math.abs(fetchedOrder7.finalCustomerPayableAmount - expectedOrder7Payable) > 0.001) {
    throw new Error('Scenario 7 failed');
  }
  console.log(`  ✓ Scenario 7 Passed: Customer-paid refund payable = ${fetchedOrder7.finalCustomerPayableAmount.toFixed(3)} TND`);

  console.log('\n--- SCENARIO 8: Dedicated Silky-Paid / Free Refund ---');
  const order8 = await orderService.createOrder({
    customer: { ...customerBase },
    items: [{ variantId: vA.variantId, quantity: 1, price: vA.price }],
    deliveryFee: 8.0,
  });
  await orderService.confirmOrder(order8.id);
  await orderService.refundOrder(order8.id, { paymentResponsibility: 'silky_paid' });
  const fetchedOrder8 = await orderRepository.findById(order8.id);
  const expectedOrder8Payable = (vA.price + 8.0) - vA.price + 0.0; // 8 TND (initial delivery retained, customer return fee = 0, carrier cost 7 excluded)
  if (Math.abs(fetchedOrder8.finalCustomerPayableAmount - expectedOrder8Payable) > 0.001) {
    throw new Error('Scenario 8 failed');
  }
  console.log(`  ✓ Scenario 8 Passed: Silky-paid free refund payable = ${fetchedOrder8.finalCustomerPayableAmount.toFixed(3)} TND`);

  console.log('\n=======================================================================');
  console.log('✅ ALL 13 USER-REQUIRED LIFECYCLE AND SNAPSHOT SCENARIOS VERIFIED SUCCESSFULLY!');
  console.log('======================================================================\n');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });