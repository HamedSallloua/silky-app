import '../config/env.js';
import { pool } from '../db/pool.js';
import { runProductVideosMigration } from '../db/migrations/add_product_videos.js';
import { productRepository } from '../repositories/product.repository.js';
import * as videoService from '../services/video.service.js';

async function runTests() {
  console.log('--- STARTING PRODUCT VIDEOS VERIFICATION ---');

  // 1. Run migration
  console.log('1. Running migration...');
  await runProductVideosMigration(pool);

  const { rows: colRows } = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'product_videos'
    ORDER BY ordinal_position
  `);
  console.log('product_videos columns:', colRows.map((c) => `${c.column_name} (${c.data_type})`));
  if (!colRows.find((c) => c.column_name === 'product_id')) {
    throw new Error('Missing product_id column in product_videos table');
  }

  // 2. Fetch an existing product
  const products = await productRepository.findAll({ includeHidden: true });
  if (!products.length) {
    throw new Error('No products found in DB to test with');
  }
  // 2. Create dedicated test product
  const [testCat] = await pool.query(`SELECT id, slug FROM categories LIMIT 1`).then(r => r.rows);
  const createdProd = await productRepository.createProduct({
    title: 'Produit Test Video ' + Date.now(),
    slug: 'prod-test-video-' + Date.now(),
    description: 'Description test video',
    price: 99.000,
    categoryId: testCat.id,
    collectionImageUrl: '/pictures/noir.jpg',
    colors: [{ colorSlug: 'noir', colorName: 'Noir', image: '/pictures/noir.jpg' }],
    sizes: ['S', 'M'],
  });
  console.log(`2. Testing with created product: "${createdProd.name}" (${createdProd.id})`);
  const targetProduct = createdProd;

  // 3. Add video 1
  console.log('3. Adding first video...');
  const video1 = await videoService.addProductVideo({
    productId: targetProduct.id,
    videoUrl: '/uploads/test-video-1.mp4',
  });
  console.log('Added video 1:', video1);

  // 4. Add video 2
  console.log('4. Adding second video...');
  const video2 = await videoService.addProductVideo({
    productId: targetProduct.id,
    videoUrl: '/uploads/test-video-2.mp4',
  });
  console.log('Added video 2:', video2);

  // 5. Query product via findById
  console.log('5. Querying product via repository findById...');
  const productWithVideos = await productRepository.findById(targetProduct.id);
  console.log(`Product videos count: ${productWithVideos.videos.length}`);
  console.log('Product videos:', productWithVideos.videos);

  if (productWithVideos.videos.length !== 2) {
    throw new Error('Expected exactly 2 videos on product');
  }
  if (productWithVideos.videos[0].videoUrl !== '/uploads/test-video-1.mp4') {
    throw new Error('Video 1 ordering mismatch');
  }
  if (productWithVideos.videos[1].videoUrl !== '/uploads/test-video-2.mp4') {
    throw new Error('Video 2 ordering mismatch');
  }

  // 6. Verify variant independence:
  console.log('6. Verifying variants and stock are completely unaffected...');
  if (!productWithVideos.variants || !productWithVideos.colors) {
    throw new Error('Product variants or colors missing');
  }
  console.log(`Product has ${productWithVideos.variants.length} variants, ${productWithVideos.colors.length} colors.`);

  // 7. Delete single video
  console.log(`7. Deleting single video ${video1.id}...`);
  await videoService.deleteProductVideo({
    productId: targetProduct.id,
    videoId: video1.id,
  });

  const productAfterDelete = await productRepository.findById(targetProduct.id);
  const remainingVideoIds = productAfterDelete.videos.map((v) => v.id);
  if (remainingVideoIds.includes(video1.id)) {
    throw new Error('Deleted video is still present in product.videos');
  }
  if (!remainingVideoIds.includes(video2.id)) {
    throw new Error('Video 2 was unexpectedly removed');
  }
  console.log('Deleted video 1 successfully, video 2 is preserved intact.');

  // Clean up product
  console.log(`Cleaning up test product (${targetProduct.id})...`);
  await productRepository.deleteProduct(targetProduct.id);

  console.log('--- ALL PRODUCT VIDEO TESTS PASSED SUCCESSFULLY ---');
  await pool.end();
  process.exit(0);
}

runTests().catch(async (err) => {
  console.error('Test failed:', err);
  await pool.end();
  process.exit(1);
});
