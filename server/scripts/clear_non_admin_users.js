import '../config/env.js';
import { pool } from '../db/pool.js';

async function clearNonAdminUsers() {
  console.log('--- Clearing non-admin users and personal data ---');

  // Delete non-admin users
  const { rowCount: u } = await pool.query("DELETE FROM users WHERE role != 'admin'");
  console.log(`Deleted ${u} customer user(s).`);

  // Delete all carts, favourites, reviews, store_reviews, orders, exchanges
  await pool.query('DELETE FROM cart_items');
  await pool.query('DELETE FROM carts');
  await pool.query('DELETE FROM favourites');
  await pool.query('DELETE FROM reviews');
  await pool.query('DELETE FROM store_reviews');
  await pool.query('DELETE FROM exchange_items');
  await pool.query('DELETE FROM order_exchanges');
  await pool.query('DELETE FROM order_items');
  await pool.query('DELETE FROM orders');

  console.log('Cleared all carts, favourites, reviews, and order records.');

  const { rows } = await pool.query('SELECT id, email, full_name, role FROM users');
  console.log('\nRemaining Users in Database:');
  console.table(rows);
}

clearNonAdminUsers()
  .catch((err) => {
    console.error('Error clearing non-admin users:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
