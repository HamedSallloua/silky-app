import '../config/env.js';
import { pool } from '../db/pool.js';

async function clearReviews() {
  console.log('--- Clearing reviews ---');

  const { rowCount: pr } = await pool.query('DELETE FROM reviews');
  console.log(`Deleted ${pr} product review(s).`);

  const { rowCount: sr } = await pool.query('DELETE FROM store_reviews');
  console.log(`Deleted ${sr} store review(s).`);

  console.log('\n✅ All reviews cleared successfully.');
}

clearReviews()
  .catch((err) => {
    console.error('Error clearing reviews:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
