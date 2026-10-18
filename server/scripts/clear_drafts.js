import '../config/env.js';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const { rowCount: di } = await pool.query('DELETE FROM draft_items');
  console.log(`Deleted ${di} draft_items`);

  const { rowCount: dc } = await pool.query('DELETE FROM draft_conversions');
  console.log(`Deleted ${dc} draft_conversions`);

  const { rowCount: d } = await pool.query('DELETE FROM drafts');
  console.log(`Deleted ${d} drafts`);

  console.log('\n✅ All drafts cleared successfully.');
} finally {
  await pool.end();
}
