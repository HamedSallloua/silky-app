import '../config/env.js';
import { pool } from '../db/pool.js';

async function check() {
  const colRes = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE column_name = 'order_source'
  `);
  console.log('Columns matching order_source:', colRes.rows);

  const typRes = await pool.query(`
    SELECT typname FROM pg_type WHERE typname = 'order_source'
  `);
  console.log('Types matching order_source:', typRes.rows);

  const idxRes = await pool.query(`
    SELECT indexname FROM pg_indexes WHERE indexname = 'idx_orders_order_source'
  `);
  console.log('Indexes matching idx_orders_order_source:', idxRes.rows);

  const orderCount = await pool.query(`
    SELECT count(*)::int as count FROM orders
  `);
  console.log('Total orders in DB (preserved intact):', orderCount.rows[0].count);

  process.exit(0);
}

check().catch((err) => {
  console.error(err);
  process.exit(1);
});
