import '../config/env.js';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  // Delete in dependency order: refund_items -> order_refunds -> exchange_items -> order_exchanges -> order_email_deliveries -> order_items -> orders
  const { rowCount: ri } = await pool.query('DELETE FROM refund_items');
  console.log(`Deleted ${ri} refund_items`);

  const { rowCount: orf } = await pool.query('DELETE FROM order_refunds');
  console.log(`Deleted ${orf} order_refunds`);

  const { rowCount: ei } = await pool.query('DELETE FROM exchange_items');
  console.log(`Deleted ${ei} exchange_items`);

  const { rowCount: oe } = await pool.query('DELETE FROM order_exchanges');
  console.log(`Deleted ${oe} order_exchanges`);

  const { rowCount: oed } = await pool.query('DELETE FROM order_email_deliveries');
  console.log(`Deleted ${oed} order_email_deliveries`);

  const { rowCount: oi } = await pool.query('DELETE FROM order_items');
  console.log(`Deleted ${oi} order_items`);

  const { rowCount: o } = await pool.query('DELETE FROM orders');
  console.log(`Deleted ${o} orders`);

  console.log('\n✅ All orders, exchanges, refunds, and deliveries cleared successfully.');
} finally {
  await pool.end();
}
