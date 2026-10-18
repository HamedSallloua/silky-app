import { pool } from '../db/pool.js';
import { runInTransaction } from '../repositories/transaction.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { reviewRepository } from '../repositories/review.repository.js';
import { contactRepository } from '../repositories/contact.repository.js';
import { cartRepository } from '../repositories/cart.repository.js';
import { favouriteRepository } from '../repositories/favourite.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import * as reviewService from '../services/review.service.js';
import * as contactService from '../services/contact.service.js';
import * as authService from '../services/auth.service.js';
import { mergeGuestSessionIntoUser } from '../services/guestMerge.service.js';
import crypto from 'crypto';

async function runTests() {
  console.log('=== STARTING PRE-CLIENTÈLE FIXES VERIFICATION ===\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passedTests++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // Setup test user and products
  const testGuestSessionId = crypto.randomUUID();
  const testGuestSessionId2 = crypto.randomUUID();

  const [testProduct] = await pool.query(`
    SELECT p.id, pv.id as variant_id 
    FROM products p 
    JOIN product_variants pv ON pv.product_id = p.id 
    WHERE p.is_active = true 
    LIMIT 1;
  `).then(r => r.rows);

  assert(testProduct && testProduct.id, 'Test product exists');

  // Create a test user
  const uniqueSuffix = Date.now().toString().slice(-6);
  const testUserEmail = `testuser_${uniqueSuffix}@example.com`;
  const testUserPhone = `9${uniqueSuffix.slice(-7)}`;
  
  const testUser = await authService.registerUser({
    identifier: testUserEmail,
    password: 'Password123!',
    fullName: 'Test Verif User',
    phoneNumber: testUserPhone,
  });

  assert(testUser && testUser.user && testUser.user.id, 'Test user registered');
  const userId = testUser.user.id;

  // ----------------------------------------------------
  // TEST 1: Product review identity attribution
  // ----------------------------------------------------
  console.log('\n--- 1. Testing Product Review Attribution ---');
  
  // 1a: Guest product review
  const guestProdReview = await reviewService.createProductReview({
    productId: testProduct.id,
    userId: null,
    guestSessionId: testGuestSessionId,
    email: 'guest.reviewer@example.com',
    authorName: 'Guest Reviewer',
    rating: 5,
    comment: 'Great product from guest',
  });

  const [dbGuestProdReview] = (await pool.query('SELECT * FROM reviews WHERE id = $1', [guestProdReview.id])).rows;
  assert(dbGuestProdReview.user_id === null, 'Guest product review has user_id = NULL');
  assert(dbGuestProdReview.guest_session_id === testGuestSessionId, 'Guest product review has guest_session_id populated');
  assert(dbGuestProdReview.email === 'guest.reviewer@example.com', 'Guest product review has submitted email persisted');

  // 1b: Authenticated product review
  const authProdReview = await reviewService.createProductReview({
    productId: testProduct.id,
    userId: userId,
    guestSessionId: null,
    email: null,
    authorName: 'Test Verif User',
    rating: 4,
    comment: 'Great product from auth user',
  });

  const [dbAuthProdReview] = (await pool.query('SELECT * FROM reviews WHERE id = $1', [authProdReview.id])).rows;
  assert(dbAuthProdReview.user_id === userId, 'Auth product review has authoritative user_id');
  assert(dbAuthProdReview.guest_session_id === null, 'Auth product review has guest_session_id = NULL');
  assert(dbAuthProdReview.email === null, 'Auth product review has email = NULL (not self-reported)');

  // ----------------------------------------------------
  // TEST 2: Store review identity attribution
  // ----------------------------------------------------
  console.log('\n--- 2. Testing Store Review Attribution ---');

  // 2a: Guest store review
  const guestStoreReview = await reviewService.createStoreReview({
    authorName: 'Guest Store Customer',
    email: 'guest.store@example.com',
    body: 'Awesome store from guest',
    rating: 5,
    userId: null,
    guestSessionId: testGuestSessionId,
  });

  const [dbGuestStoreReview] = (await pool.query('SELECT * FROM store_reviews WHERE id = $1', [guestStoreReview.id])).rows;
  assert(dbGuestStoreReview.user_id === null, 'Guest store review has user_id = NULL');
  assert(dbGuestStoreReview.guest_session_id === testGuestSessionId, 'Guest store review has guest_session_id populated');
  assert(dbGuestStoreReview.email === 'guest.store@example.com', 'Guest store review preserves informational email');

  // 2b: Authenticated store review
  const authStoreReview = await reviewService.createStoreReview({
    authorName: 'Edited Name That Should Be Overridden By User FullName',
    email: 'selfreported@example.com',
    body: 'Awesome store from auth user',
    rating: 5,
    userId: userId,
    guestSessionId: null,
  });

  const [dbAuthStoreReview] = (await pool.query('SELECT * FROM store_reviews WHERE id = $1', [authStoreReview.id])).rows;
  assert(dbAuthStoreReview.user_id === userId, 'Auth store review has authoritative user_id');
  assert(dbAuthStoreReview.guest_session_id === null, 'Auth store review has guest_session_id = NULL');
  assert(dbAuthStoreReview.author_name === 'Test Verif User', 'Auth store review uses authoritative user full_name');

  // ----------------------------------------------------
  // TEST 3: Contact message identity attribution
  // ----------------------------------------------------
  console.log('\n--- 3. Testing Contact Message Attribution ---');

  // 3a: Guest contact message
  const guestContact = await contactService.submitContactMessage({
    userId: null,
    guestSessionId: testGuestSessionId,
    firstName: 'Guest',
    lastName: 'Sender',
    email: 'guest.sender@example.com',
    message: 'Hello from guest',
  });

  const [dbGuestContact] = (await pool.query('SELECT * FROM contact_messages WHERE id = $1', [guestContact.id])).rows;
  assert(dbGuestContact.user_id === null, 'Guest contact message has user_id = NULL');
  assert(dbGuestContact.guest_session_id === testGuestSessionId, 'Guest contact message has guest_session_id populated');

  // 3b: Authenticated contact message
  const authContact = await contactService.submitContactMessage({
    userId: userId,
    guestSessionId: null,
    firstName: 'Test',
    lastName: 'User',
    email: testUserEmail,
    message: 'Hello from authenticated user',
  });

  const [dbAuthContact] = (await pool.query('SELECT * FROM contact_messages WHERE id = $1', [authContact.id])).rows;
  assert(dbAuthContact.user_id === userId, 'Auth contact message has user_id populated');
  assert(dbAuthContact.guest_session_id === null, 'Auth contact message has guest_session_id = NULL');

  // ----------------------------------------------------
  // TEST 4: Customer email / phone account validation
  // ----------------------------------------------------
  console.log('\n--- 4. Testing Account Email/Phone Validation ---');

  // 4a: Both present (initial state) -> valid
  assert(testUser.user.email && testUser.user.phoneNumber, 'Initial user has both email and phone');

  // 4b: Update to phone-only (clearing email from a phone-only user)
  // Let's create a phone-only user
  const phoneOnlyDigits = `5${Date.now().toString().slice(-7)}`;
  const phoneOnlyUser = await authService.registerUser({
    identifier: phoneOnlyDigits,
    password: 'Password123!',
    fullName: 'Phone Only User',
  });
  assert(phoneOnlyUser.user.email === null && phoneOnlyUser.user.phoneNumber === phoneOnlyDigits, 'Phone-only user created');

  // 4c: Attempt to clear phone number on phone-only user -> MUST throw
  let clearedBothError = null;
  try {
    await authService.updateProfile(phoneOnlyUser.user.id, {
      fullName: 'Phone Only User',
      phoneNumber: '', // clearing phone
      email: '', // no email
    });
  } catch (err) {
    clearedBothError = err;
  }
  assert(clearedBothError !== null, 'Clearing both email and phone is rejected with error in updateProfile');
  assert(clearedBothError.message.includes('Vous devez conserver au moins un e-mail ou un numéro de téléphone'), `Expected error message received: ${clearedBothError?.message}`);

  // 4d: Verify DB constraint blocks direct SQL insert/update with both NULL
  let dbCheckViolated = false;
  try {
    await pool.query(`
      INSERT INTO users (email, password_hash, full_name, phone_number)
      VALUES (NULL, 'hash123', 'Invalid User', NULL)
    `);
  } catch (err) {
    if (err.message.includes('users_email_or_phone_required')) {
      dbCheckViolated = true;
    }
  }
  assert(dbCheckViolated, 'Database CHECK constraint users_email_or_phone_required blocks rows with both NULL');

  // ----------------------------------------------------
  // TEST 5: Guest cart merge & cleanup
  // ----------------------------------------------------
  console.log('\n--- 5. Testing Guest Cart Merge & Cleanup ---');

  const mergeGuestSession = crypto.randomUUID();
  
  // Create a guest cart with an item
  const guestCart = await cartRepository.findOrCreateCart({ guestSessionId: mergeGuestSession });
  await cartRepository.addItem(guestCart.id, testProduct.variant_id, 2);

  const guestItemsBefore = await cartRepository.getCartItems(guestCart.id);
  assert(guestItemsBefore.length === 1 && guestItemsBefore[0].quantity === 2, 'Guest cart created with item qty=2');

  // Perform merge into testUser
  await runInTransaction(async (tx) => {
    await mergeGuestSessionIntoUser(userId, mergeGuestSession, tx);
  });

  // Verify user cart has items
  const userCart = await cartRepository.findCartByUserId(userId);
  const userItems = await cartRepository.getCartItems(userCart.id);
  assert(userItems.some(i => i.variantId === testProduct.variant_id), 'User cart contains the merged item');

  // Verify guest cart was deleted
  const guestCartAfter = await cartRepository.findCartByGuestSessionId(mergeGuestSession);
  assert(guestCartAfter === null, 'Guest cart record was deleted after merge');

  // Verify guest cart items were deleted via cascade
  const guestItemsAfter = await pool.query('SELECT * FROM cart_items WHERE cart_id = $1', [guestCart.id]);
  assert(guestItemsAfter.rows.length === 0, 'Guest cart items were deleted via CASCADE');

  // ----------------------------------------------------
  // TEST 6: Favourites merge & cleanup
  // ----------------------------------------------------
  console.log('\n--- 6. Testing Favourites Merge & Cleanup ---');

  const favGuestSession = crypto.randomUUID();
  await favouriteRepository.add({ guestSessionId: favGuestSession }, { productId: testProduct.id, variantId: testProduct.variant_id });

  const guestFavsBefore = await favouriteRepository.findByShopper({ guestSessionId: favGuestSession });
  assert(guestFavsBefore.length === 1, 'Guest favourite added');

  await runInTransaction(async (tx) => {
    await mergeGuestSessionIntoUser(userId, favGuestSession, tx);
  });

  const userFavs = await favouriteRepository.findByShopper({ userId });
  assert(userFavs.some(f => f.productId === testProduct.id), 'User favourites contain merged item');

  const guestFavsAfter = await favouriteRepository.findByShopper({ guestSessionId: favGuestSession });
  assert(guestFavsAfter.length === 0, 'Guest favourites deleted after merge');

  // Cleanup test records
  console.log('\n--- Cleaning up test records ---');
  await pool.query('DELETE FROM reviews WHERE id IN ($1, $2)', [guestProdReview.id, authProdReview.id]);
  await pool.query('DELETE FROM store_reviews WHERE id IN ($1, $2)', [guestStoreReview.id, authStoreReview.id]);
  await pool.query('DELETE FROM contact_messages WHERE id IN ($1, $2)', [guestContact.id, authContact.id]);
  await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [userId, phoneOnlyUser.user.id]);

  console.log(`\n========================================`);
  console.log(`ALL TESTS PASSED: ${passedTests}/${totalTests} assertions verified!`);
  console.log(`========================================\n`);

  await pool.end();
}

runTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  pool.end().finally(() => process.exit(1));
});
