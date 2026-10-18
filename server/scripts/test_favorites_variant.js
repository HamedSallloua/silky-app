import '../config/env.js';
import assert from 'node:assert';
import { pool } from '../db/pool.js';
import { runFavouritesVariantMigration } from '../db/migrations/add_favourites_variant.js';
import { favouriteRepository } from '../repositories/favourite.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import * as favouriteService from '../services/favourite.service.js';

async function runTests() {
  console.log('--- Starting Favorites Variant-Aware Tests ---');

  // 1. Test migration idempotency
  console.log('1. Running migration (first pass)...');
  await runFavouritesVariantMigration(pool);
  console.log('2. Running migration (second pass to test idempotency)...');
  await runFavouritesVariantMigration(pool);
  console.log('✓ Migration executed idempotently');

  // Find a product with multiple variants
  const products = await productRepository.findAll({ includeHidden: true });
  assert(products.length > 0, 'Catalog must have products');
  const testProduct = products.find((p) => p.variants?.length >= 2) || products[0];
  console.log(`Using product "${testProduct.name}" (ID: ${testProduct.id}) with ${testProduct.variants?.length || 0} variants`);

  const var1 = testProduct.variants[0];
  const var2 = testProduct.variants[1];
  assert(var1 && var2, 'Product must have at least 2 variants for testing');
  console.log(`Variant 1: ID=${var1.id}, Color=${var1.colorName} (${var1.colorSlug}), Size=${var1.size}`);
  console.log(`Variant 2: ID=${var2.id}, Color=${var2.colorName} (${var2.colorSlug}), Size=${var2.size}`);

  const testGuestSession1 = '11111111-1111-4111-8111-111111111111';
  const testGuestSession2 = '22222222-2222-4222-8222-222222222222';
  const testUserId = '33333333-3333-4333-8333-333333333333';

  // Clean up any test records first
  await pool.query('DELETE FROM favourites WHERE guest_session_id IN ($1, $2) OR user_id = $3', [
    testGuestSession1,
    testGuestSession2,
    testUserId,
  ]);

  // Ensure fake test user exists in users table if needed or use null user
  // Let's test with guest session first
  const shopperGuest = { userId: null, guestSessionId: testGuestSession1 };

  // Test 2: Add first variant
  console.log('\n--- Test 2: Add Variant 1 ---');
  const addRes1 = await favouriteService.toggleFavourite(shopperGuest, {
    productId: testProduct.id,
    variantId: var1.id,
  });
  assert.strictEqual(addRes1.isFavourite, true, 'Variant 1 should be favorited');
  assert.strictEqual(addRes1.variantId, var1.id, 'Variant 1 ID must match');
  assert.strictEqual(addRes1.favourites.length, 1, 'Should have 1 favorite');
  assert.strictEqual(addRes1.favourites[0].variantId, var1.id, 'Persisted variantId must match');
  assert.strictEqual(addRes1.favourites[0].colorSlug, var1.colorSlug, 'Color slug must match');
  assert.strictEqual(addRes1.favourites[0].size, var1.size, 'Size must match');
  console.log('✓ Variant 1 favorited successfully with correct metadata');

  // Test 3: Add second variant of the same product (must coexist!)
  console.log('\n--- Test 3: Add Variant 2 of same product (Coexistence) ---');
  const addRes2 = await favouriteService.toggleFavourite(shopperGuest, {
    productId: testProduct.id,
    variantId: var2.id,
  });
  assert.strictEqual(addRes2.isFavourite, true, 'Variant 2 should be favorited');
  assert.strictEqual(addRes2.favourites.length, 2, 'Both variants must coexist in favorites');
  const favVar1 = addRes2.favourites.find((f) => f.variantId === var1.id);
  const favVar2 = addRes2.favourites.find((f) => f.variantId === var2.id);
  assert(favVar1, 'Variant 1 must still be present');
  assert(favVar2, 'Variant 2 must be present');
  console.log('✓ Multiple variants of same product coexist independently');

  // Test 4: Verify variant resolution via colorId + size
  console.log('\n--- Test 4: Variant resolution via colorId + size ---');
  const shopperGuest2 = { userId: null, guestSessionId: testGuestSession2 };
  const addResResolved = await favouriteService.toggleFavourite(shopperGuest2, {
    productId: testProduct.id,
    colorId: var1.colorSlug,
    size: var1.size,
  });
  assert.strictEqual(addResResolved.isFavourite, true);
  assert.strictEqual(addResResolved.variantId, var1.id, 'Must resolve to canonical var1.id');
  console.log('✓ Resolved variant from colorId + size correctly');

  // Test 5: Security / cross-product combination check
  console.log('\n--- Test 5: Security / cross-product rejection ---');
  const otherProduct = products.find((p) => p.id !== testProduct.id);
  if (otherProduct && otherProduct.variants?.length) {
    let errorThrown = false;
    try {
      await favouriteService.toggleFavourite(shopperGuest, {
        productId: otherProduct.id,
        variantId: var1.id, // var1 belongs to testProduct, NOT otherProduct!
      });
    } catch (err) {
      errorThrown = true;
      assert(err.status === 400 || err.message.includes('does not belong'), 'Must reject cross-product variant');
    }
    assert(errorThrown, 'Must throw error on cross-product variant');
    console.log('✓ Cross-product variant correctly rejected');
  }

  // Test 6: Removal of one variant leaves other variants intact
  console.log('\n--- Test 6: Variant-specific removal ---');
  const removeRes1 = await favouriteService.toggleFavourite(shopperGuest, {
    productId: testProduct.id,
    variantId: var1.id,
  });
  assert.strictEqual(removeRes1.isFavourite, false, 'Variant 1 should be removed');
  assert.strictEqual(removeRes1.favourites.length, 1, 'Only 1 favorite should remain');
  assert.strictEqual(removeRes1.favourites[0].variantId, var2.id, 'Variant 2 must remain');
  console.log('✓ Removing Variant 1 left Variant 2 completely intact');

  // Test 7: Legacy favorite handling (variant_id IS NULL)
  console.log('\n--- Test 7: Legacy favorite handling (variant_id IS NULL) ---');
  await pool.query(
    'INSERT INTO favourites (guest_session_id, product_id, variant_id) VALUES ($1, $2, NULL)',
    [testGuestSession1, otherProduct ? otherProduct.id : testProduct.id]
  );
  const listWithLegacy = await favouriteRepository.findByShopper(shopperGuest);
  const legacyFav = listWithLegacy.find((f) => f.variantId === null);
  assert(legacyFav, 'Legacy favorite with null variant_id must be retrieved');
  assert(legacyFav.image, 'Legacy favorite must have fallback image');
  console.log('✓ Legacy favorite displays safely without error');

  // Test 8: Bare productId removal only removes legacy favorite
  console.log('\n--- Test 8: Bare productId removal only removes legacy favorite ---');
  // At this point shopperGuest has:
  // - testProduct with var2.id
  // - otherProduct with variant_id = NULL
  const targetProdId = otherProduct ? otherProduct.id : testProduct.id;
  await favouriteRepository.remove(shopperGuest, { productId: targetProdId });
  const listAfterLegacyRemove = await favouriteRepository.findByShopper(shopperGuest);
  assert(!listAfterLegacyRemove.some((f) => f.productId === targetProdId && f.variantId === null), 'Legacy record should be deleted');
  assert(listAfterLegacyRemove.some((f) => f.variantId === var2.id), 'Variant 2 must still remain!');
  // Test 9: Guest -> Customer Merge
  console.log('\n--- Test 9: Guest -> Customer Merge with variants & legacy ---');
  // First find or insert a real user ID from users table
  const userRows = await pool.query('SELECT id FROM users LIMIT 1');
  if (userRows.rows.length > 0) {
    const realUserId = userRows.rows[0].id;
    // Clean user favorites for test
    await pool.query('DELETE FROM favourites WHERE user_id = $1', [realUserId]);
    await pool.query('DELETE FROM favourites WHERE guest_session_id = $1', [testGuestSession1]);

    // Customer has var1
    await favouriteRepository.add({ userId: realUserId }, { productId: testProduct.id, variantId: var1.id });
    // Guest has var1 (duplicate) and var2 (new)
    await favouriteRepository.add({ guestSessionId: testGuestSession1 }, { productId: testProduct.id, variantId: var1.id });
    await favouriteRepository.add({ guestSessionId: testGuestSession1 }, { productId: testProduct.id, variantId: var2.id });

    // Run merge
    await favouriteRepository.mergeGuestFavouritesIntoUser(realUserId, testGuestSession1);

    const userFavs = await favouriteRepository.findByShopper({ userId: realUserId });
    assert.strictEqual(userFavs.length, 2, 'User should have exactly 2 distinct variant favorites after merge');
    assert(userFavs.some((f) => f.variantId === var1.id), 'User must have var1');
    assert(userFavs.some((f) => f.variantId === var2.id), 'User must have var2');
    console.log('✓ Guest -> Customer merge preserved both variants without duplicates');
  }

  // Clean up
  await pool.query('DELETE FROM favourites WHERE guest_session_id IN ($1, $2) OR user_id = $3', [
    testGuestSession1,
    testGuestSession2,
    testUserId,
  ]);

  console.log('\n=============================================');
  console.log('All Favorites Variant Backend Tests PASSED! ✓');
  console.log('=============================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
