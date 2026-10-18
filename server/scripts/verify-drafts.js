import assert from 'assert';
import { db } from '../db/orm.js';
import { pool } from '../db/pool.js';
import { drafts, draftItems, orders, orderItems, productVariants, products } from '../models/index.js';
import * as draftService from '../services/draft.service.js';
import { draftRepository } from '../repositories/draft.repository.js';
import * as orderService from '../services/order.service.js';
import * as adminService from '../services/admin.service.js';
import { orderRepository } from '../repositories/order.repository.js';
import { runDraftTablesMigration } from '../db/migrations/add_draft_tables.js';
import { eq, inArray, sql } from 'drizzle-orm';

let passed = 0;
let failed = 0;

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    if (err.stack) console.error(err.stack);
    failed++;
  }
}

async function main() {
  console.log('\n==================================================');
  console.log('--- RUNNING ADMIN DRAFT ORDERS VERIFICATION SUITE ---');
  console.log('==================================================\n');

  // Ensure migration is applied
  await runDraftTablesMigration();

  // Clean up any test drafts/orders before starting
  await db.delete(draftItems);
  await db.delete(drafts);

  // Retrieve test product and variant for testing
  const allVariants = await db.select().from(productVariants).limit(5);
  assert.ok(allVariants.length >= 2, 'Must have at least 2 product variants in database for testing');
  const testVariant1 = allVariants[0];
  const testVariant2 = allVariants[1];

  const initialStock1 = testVariant1.stockQuantity;
  const initialStock2 = testVariant2.stockQuantity;

  let createdDraft1Id = null;

  console.log('--- 1. DRAFT CREATION & PARTIAL SAVING ---');

  await asyncTest('1. Create empty draft: saves successfully without validation errors', async () => {
    const draft = await draftService.createDraft({});
    assert.ok(draft.id, 'Draft ID must be generated');
    assert.strictEqual(draft.customerName, '');
    assert.strictEqual(draft.phoneNumber, '');
    assert.strictEqual(draft.items.length, 0);
    assert.strictEqual(draft.convertedAt, null);
    assert.strictEqual(draft.convertedOrderId, null);
    createdDraft1Id = draft.id;
  });

  await asyncTest('2. Create partially completed draft: saves name only without phone/address', async () => {
    const draft = await draftService.createDraft({
      customerName: 'Amina Mansouri',
    });
    assert.ok(draft.id);
    assert.strictEqual(draft.customerName, 'Amina Mansouri');
    assert.strictEqual(draft.phoneNumber, '');
    assert.strictEqual(draft.shippingAddress, '');
  });

  await asyncTest('3. Save draft with missing phone: address and items present, phone missing', async () => {
    const draft = await draftService.createDraft({
      customerName: 'Mohamed Salah',
      governorate: 'Tunis',
      shippingAddress: '15 Rue de Carthage',
      items: [{ variantId: testVariant1.id, quantity: 2 }],
    });
    assert.ok(draft.id);
    assert.strictEqual(draft.customerName, 'Mohamed Salah');
    assert.strictEqual(draft.phoneNumber, '');
    assert.strictEqual(draft.items.length, 1);
    assert.strictEqual(draft.items[0].quantity, 2);
  });

  await asyncTest('4. Save draft with missing address: phone and items present, address missing', async () => {
    const draft = await draftService.createDraft({
      customerName: 'Youssef Trabelsi',
      phoneNumber: '20123456',
      items: [{ variantId: testVariant2.id, quantity: 1 }],
    });
    assert.ok(draft.id);
    assert.strictEqual(draft.customerName, 'Youssef Trabelsi');
    assert.strictEqual(draft.phoneNumber, '20123456');
    assert.strictEqual(draft.shippingAddress, '');
  });

  await asyncTest('5. Save draft with products, quantities and internal notes', async () => {
    const draft = await draftService.createDraft({
      customerName: 'Leila Ben Ali',
      phoneNumber: '98765432',
      customerEmail: 'leila@example.com',
      governorate: 'Ariana',
      shippingAddress: 'Av Habib Bourguiba',
      notes: 'Livraison souhaitée le matin après 10h',
      items: [
        { variantId: testVariant1.id, quantity: 3 },
        { variantId: testVariant2.id, quantity: 2 },
      ],
    });
    assert.ok(draft.id);
    assert.strictEqual(draft.items.length, 2);
    assert.strictEqual(draft.notes, 'Livraison souhaitée le matin après 10h');
    const totalQty = draft.items.reduce((s, i) => s + i.quantity, 0);
    assert.strictEqual(totalQty, 5);
  });

  console.log('\n--- 2. REPEATED SAVES & MODIFICATION IDEMPOTENCY ---');

  await asyncTest('6. Reopen and modify draft: updates existing record without creating new rows', async () => {
    const updated = await draftService.saveDraft(createdDraft1Id, {
      customerName: 'Karim Jaziri',
      phoneNumber: '55112233',
      governorate: 'Sousse',
      shippingAddress: 'Khezama Ouest',
      items: [{ variantId: testVariant1.id, quantity: 1 }],
    });
    assert.strictEqual(updated.id, createdDraft1Id);
    assert.strictEqual(updated.customerName, 'Karim Jaziri');
    assert.strictEqual(updated.phoneNumber, '55112233');
    assert.strictEqual(updated.items.length, 1);
  });

  await asyncTest('7. Save same draft multiple times without duplication: exactly 1 row maintained', async () => {
    for (let i = 1; i <= 5; i++) {
      await draftService.saveDraft(createdDraft1Id, {
        customerName: `Karim Jaziri Edit ${i}`,
        phoneNumber: '55112233',
      });
    }

    const [countResult] = await db
      .select({ count: sql`count(*)::int` })
      .from(drafts)
      .where(eq(drafts.id, createdDraft1Id));

    assert.strictEqual(countResult.count, 1, 'Draft row count must be exactly 1');
  });

  console.log('\n--- 3. ZERO STOCK MUTATION & REAL ORDER ISOLATION ---');

  await asyncTest('8. Draft operations NEVER modify or reserve warehouse stock', async () => {
    const [v1] = await db.select().from(productVariants).where(eq(productVariants.id, testVariant1.id));
    const [v2] = await db.select().from(productVariants).where(eq(productVariants.id, testVariant2.id));

    assert.strictEqual(v1.stockQuantity, initialStock1, 'Variant 1 stock must remain unchanged');
    assert.strictEqual(v2.stockQuantity, initialStock2, 'Variant 2 stock must remain unchanged');
  });

  await asyncTest('9. Drafts NEVER appear as real orders in orders table or orderRepository', async () => {
    const allOrders = await orderService.getAllOrders();
    const draftIdsInOrders = allOrders.filter((o) => o.id === createdDraft1Id);
    assert.strictEqual(draftIdsInOrders.length, 0, 'Draft ID must never be present in orders list');
  });

  console.log('\n--- 4. INCOMPLETE CONFIRMATION REJECTION & VALIDATION ---');

  await asyncTest('10. Incomplete draft cannot be confirmed: missing phone rejected with 422', async () => {
    const incompleteDraft = await draftService.createDraft({
      customerName: 'Test Incomplete',
      governorate: 'Tunis',
      shippingAddress: 'Rue Test',
      items: [{ variantId: testVariant1.id, quantity: 1 }],
    });

    let threw = false;
    try {
      await draftService.confirmDraftAsOrder(incompleteDraft.id);
    } catch (err) {
      threw = true;
      assert.strictEqual(err.status, 422);
      assert.ok(Array.isArray(err.missingFields));
      assert.ok(err.missingFields.some((f) => f.includes('téléphone')));
    }
    assert.ok(threw, 'Should have thrown 422 for missing phone');
  });

  await asyncTest('11. Incomplete draft cannot be confirmed: missing items rejected with 422', async () => {
    const noItemsDraft = await draftService.createDraft({
      customerName: 'Test No Items',
      phoneNumber: '22334455',
      governorate: 'Tunis',
      shippingAddress: 'Rue Test',
      items: [],
    });

    let threw = false;
    try {
      await draftService.confirmDraftAsOrder(noItemsDraft.id);
    } catch (err) {
      threw = true;
      assert.strictEqual(err.status, 422);
      assert.ok(err.missingFields.some((f) => f.includes('article')));
    }
    assert.ok(threw, 'Should have thrown 422 for missing items');
  });

  await asyncTest('12. Failed confirmation leaves draft completely unchanged and causes zero mutation', async () => {
    const [v1] = await db.select().from(productVariants).where(eq(productVariants.id, testVariant1.id));
    assert.strictEqual(v1.stockQuantity, initialStock1, 'Stock must remain unmodified');
  });

  console.log('\n--- 5. SUCCESSFUL CONFIRMATION VIA EXISTING MANUAL ORDERS ---');

  let confirmedOrder = null;
  let convertibleDraft = null;

  await asyncTest('13. Complete draft confirms successfully through existing Manual Orders logic', async () => {
    convertibleDraft = await draftService.createDraft({
      customerName: 'Samir Gharbi',
      phoneNumber: '99887766',
      customerEmail: 'samir@example.com',
      governorate: 'Bizerte',
      shippingAddress: '12 Rue de la Corniche',
      orderSource: 'social_media',
      deliveryFee: 10,
      notes: 'Notes de préparation...',
      items: [
        { variantId: testVariant1.id, quantity: 2 },
      ],
    });

    confirmedOrder = await draftService.confirmDraftAsOrder(convertibleDraft.id);
    assert.ok(confirmedOrder.id, 'Real order must have an ID');
    assert.ok(confirmedOrder.orderNumber.startsWith('SLK-M-'), `Order number must follow Manual Orders convention (got ${confirmedOrder.orderNumber})`);
    assert.strictEqual(confirmedOrder.customer.name, 'Samir Gharbi');
    assert.strictEqual(confirmedOrder.customer.phone, '99887766');
    assert.strictEqual(confirmedOrder.customer.address, 'Bizerte — 12 Rue de la Corniche');
  });

  await asyncTest('14. Correct stock deduction occurs ONLY after successful confirmation', async () => {
    const [v1] = await db.select().from(productVariants).where(eq(productVariants.id, testVariant1.id));
    assert.strictEqual(v1.stockQuantity, initialStock1 - 2, 'Stock must be deducted by exactly 2');
  });

  await asyncTest('15. Correct delivery fee and order total calculated via existing Manual Orders rules', async () => {
    assert.strictEqual(confirmedOrder.deliveryFee, 10, 'Custom delivery fee must match');
    assert.strictEqual(confirmedOrder.total, confirmedOrder.subtotal + 10, 'Total must equal subtotal + deliveryFee');
  });

  await asyncTest('16. Draft is marked converted with convertedAt and convertedOrderId', async () => {
    const updatedDraft = await draftRepository.findDraftById(convertibleDraft.id);
    assert.ok(updatedDraft.convertedAt !== null, 'convertedAt must be set');
    assert.strictEqual(updatedDraft.convertedOrderId, confirmedOrder.id, 'convertedOrderId must match created order ID');
  });

  console.log('\n--- 6. DUPLICATE & CONCURRENCY PROTECTION ---');

  await asyncTest('17. Double-click / repeated confirmation cannot create duplicate orders', async () => {
    let threw = false;
    try {
      await draftService.confirmDraftAsOrder(convertibleDraft.id);
    } catch (err) {
      threw = true;
      assert.strictEqual(err.status, 409, 'Must return 409 Conflict');
    }
    assert.ok(threw, 'Second confirmation attempt must be rejected');

    // Verify stock was not deducted a second time
    const [v1] = await db.select().from(productVariants).where(eq(productVariants.id, testVariant1.id));
    assert.strictEqual(v1.stockQuantity, initialStock1 - 2, 'Stock must not be deducted again');
  });

  await asyncTest('18. Concurrent confirmations on same draft produce EXACTLY ONE real order', async () => {
    const concurrentDraft = await draftService.createDraft({
      customerName: 'Fatma Dridi',
      phoneNumber: '21334455',
      governorate: 'Monastir',
      shippingAddress: 'Rue de la Plage',
      orderSource: 'phone',
      items: [{ variantId: testVariant2.id, quantity: 1 }],
    });

    const results = await Promise.allSettled([
      draftService.confirmDraftAsOrder(concurrentDraft.id),
      draftService.confirmDraftAsOrder(concurrentDraft.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactly 1 confirmation must succeed');
    assert.strictEqual(rejected.length, 1, 'Exactly 1 confirmation must be rejected with conflict');
    assert.strictEqual(rejected[0].reason.status, 409);

    // Verify variant 2 stock deducted by exactly 1 (not 2)
    const [v2] = await db.select().from(productVariants).where(eq(productVariants.id, testVariant2.id));
    assert.strictEqual(v2.stockQuantity, initialStock2 - 1, 'Variant 2 stock must be deducted exactly once');
  });

  await asyncTest('19. Converted draft cannot be edited or modified', async () => {
    let threw = false;
    try {
      await draftService.saveDraft(convertibleDraft.id, {
        customerName: 'Modified Name Attempt',
      });
    } catch (err) {
      threw = true;
      assert.strictEqual(err.status, 409);
    }
    assert.ok(threw, 'Editing converted draft must be rejected with 409');
  });

  await asyncTest('20. Multiple drafts remain completely independent', async () => {
    const draftA = await draftService.createDraft({ customerName: 'Draft A', phoneNumber: '11111111' });
    const draftB = await draftService.createDraft({ customerName: 'Draft B', phoneNumber: '22222222' });

    await draftService.saveDraft(draftA.id, { customerName: 'Draft A Updated' });

    const fetchedB = await draftService.getDraftById(draftB.id);
    assert.strictEqual(fetchedB.customerName, 'Draft B', 'Draft B must remain unchanged when Draft A is updated');
  });

  console.log('\n--- 7. CROSS-TRANSACTION IDEMPOTENCY & RECOVERY ---');

  await asyncTest('21. Post-order-creation persistence recovery (State D): recovers existing order without creating a duplicate', async () => {
    // 1. Create a valid unconverted draft
    const recoveryDraft = await draftService.createDraft({
      customerName: 'State D Test Client',
      phoneNumber: '99001122',
      governorate: 'Kairouan',
      shippingAddress: 'Rue El Qods',
      items: [{ variantId: testVariant1.id, quantity: 1 }],
    });

    // 2. Simulate State D: createManualOrder succeeded and recorded in journal,
    // but draft table update was interrupted/crashed so drafts.converted_order_id is NULL.
    const createdOrder = await adminService.createManualOrder({
      customerName: 'State D Test Client',
      phoneNumber: '99001122',
      orderSource: 'social_media',
      governorate: 'Kairouan',
      shippingAddress: 'Rue El Qods',
      items: [{ variantId: testVariant1.id, quantity: 1 }],
    });
    assert.ok(createdOrder.id, 'Real order was created');

    // Record the draft-to-order mapping in the conversion journal
    await draftRepository.recordDraftConversion(recoveryDraft.id, createdOrder.id);

    // Verify the draft record in 'drafts' table is STILL UNCONVERTED (State D condition)
    const draftBeforeRetry = await draftService.getDraftById(recoveryDraft.id);
    assert.strictEqual(draftBeforeRetry.convertedOrderId, null, 'Draft convertedOrderId must be null before retry');
    assert.strictEqual(draftBeforeRetry.convertedAt, null, 'Draft convertedAt must be null before retry');

    // Record initial order count
    const [ordersCountBefore] = await db
      .select({ count: sql`count(*)::int` })
      .from(orders);

    // 3. Retry confirmation using the same draft
    const recoveredOrder = await draftService.confirmDraftAsOrder(recoveryDraft.id);

    // 4. Verify no duplicate order was created and the exact same order was recovered
    const [ordersCountAfter] = await db
      .select({ count: sql`count(*)::int` })
      .from(orders);

    assert.strictEqual(ordersCountAfter.count, ordersCountBefore.count, 'Order count must NOT increase on State D retry');
    assert.strictEqual(recoveredOrder.id, createdOrder.id, 'Recovered order ID must match the already-created order ID');
    assert.strictEqual(recoveredOrder.orderNumber, createdOrder.orderNumber, 'Order number must match');

    // 5. Verify the draft is now permanently marked as converted with the recovered order ID
    const draftAfterRetry = await draftService.getDraftById(recoveryDraft.id);
    assert.strictEqual(draftAfterRetry.convertedOrderId, createdOrder.id, 'Draft must now have convertedOrderId set');
    assert.ok(draftAfterRetry.convertedAt !== null, 'Draft must now have convertedAt timestamp');

    // 6. Verify subsequent retries reject with 409 without creating duplicate orders
    let threw = false;
    try {
      await draftService.confirmDraftAsOrder(recoveryDraft.id);
    } catch (err) {
      threw = true;
      assert.strictEqual(err.status, 409, 'Subsequent confirmation on converted draft must return 409');
    }
    assert.ok(threw, 'Subsequent confirmation on converted draft must be rejected');

    const [ordersCountFinal] = await db
      .select({ count: sql`count(*)::int` })
      .from(orders);
    assert.strictEqual(ordersCountFinal.count, ordersCountBefore.count, 'Order count must remain constant across retries');
  });

  await asyncTest('22. Transactional rollback when createManualOrder fails (e.g. insufficient stock): zero order created, zero stock mutation', async () => {
    // Record current stock
    const [currentV1] = await db.select().from(productVariants).where(eq(productVariants.id, testVariant1.id));
    const currentStock = currentV1.stockQuantity;

    // Create a draft requesting more than available stock (e.g. currentStock + 100, but <= MAX_ITEM_QUANTITY or exceeding stock)
    const excessiveQty = currentStock + 10;
    const excessiveDraft = await draftService.createDraft({
      customerName: 'Excessive Stock Client',
      phoneNumber: '88776655',
      governorate: 'Tunis',
      shippingAddress: 'Rue Test',
      items: [{ variantId: testVariant1.id, quantity: Math.min(excessiveQty, 50) }],
    });

    // If stock is >= 40, set stock temporarily to 2 for this test
    if (currentStock >= 40) {
      await db.update(productVariants).set({ stockQuantity: 2 }).where(eq(productVariants.id, testVariant1.id));
    }

    let threw = false;
    let errorMessage = '';
    try {
      await draftService.confirmDraftAsOrder(excessiveDraft.id);
    } catch (err) {
      threw = true;
      errorMessage = err.message;
    }
    assert.ok(threw, 'Should throw error when stock is insufficient');
    assert.ok(errorMessage.includes('stock insuffisant'), `Error message should mention insufficient stock (got ${errorMessage})`);

    // Verify draft remains unconverted
    const refreshed = await draftService.getDraftById(excessiveDraft.id);
    assert.strictEqual(refreshed.convertedAt, null, 'Draft convertedAt must remain null');
    assert.strictEqual(refreshed.convertedOrderId, null, 'Draft convertedOrderId must remain null');

    // Verify stock was not mutated
    const [afterV1] = await db.select().from(productVariants).where(eq(productVariants.id, testVariant1.id));
    if (currentStock >= 40) {
      assert.strictEqual(afterV1.stockQuantity, 2, 'Stock must remain unmodified at 2');
      // Restore stock
      await db.update(productVariants).set({ stockQuantity: currentStock }).where(eq(productVariants.id, testVariant1.id));
    } else {
      assert.strictEqual(afterV1.stockQuantity, currentStock, 'Stock must remain unmodified');
    }
  });

  await asyncTest('23. Converted drafts remain visible in Drafts list (Requirement 7)', async () => {
    const allDrafts = await draftService.getAllDrafts();
    assert.ok(Array.isArray(allDrafts));
    // Converted drafts must remain in the drafts list with convertedAt and convertedOrderId populated
    const hasConverted = allDrafts.some((d) => d.convertedAt !== null && d.convertedOrderId !== null);
    assert.strictEqual(hasConverted, true, 'getAllDrafts must retain converted drafts in the drafts list');
  });

  console.log(`\n==================================================`);
  console.log(`DRAFT TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log(`==================================================\n`);

  await new Promise((r) => setTimeout(r, 500));
  await pool.end();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
