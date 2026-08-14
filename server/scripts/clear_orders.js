import '../config/env.js';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  // Delete in dependency order: exchange_items -> order_exchanges -> order_items -> orders
  const { rowCount: ei } = await pool.query('DELETE FROM exchange_items');
  console.log(`Deleted ${ei} exchange_items`);

  const { rowCount: oe } = await pool.query('DELETE FROM order_exchanges');
  console.log(`Deleted ${oe} order_exchanges`);

  const { rowCount: oi } = await pool.query('DELETE FROM order_items');
  console.log(`Deleted ${oi} order_items`);

  const { rowCount: o } = await pool.query('DELETE FROM orders');
  console.log(`Deleted ${o} orders`);

  console.log('\n✅ All orders cleared successfully.');
} finally {
  await pool.end();
}
