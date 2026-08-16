import '../config/env.js';
import { pool } from '../db/pool.js';

async function clearContactMessages() {
  console.log('--- Clearing contact messages ---');

  const { rowCount } = await pool.query('DELETE FROM contact_messages');
  console.log(`Deleted ${rowCount} contact message(s).`);

  console.log('\n? All contact messages cleared successfully.');
}

clearContactMessages()
  .catch((err) => {
    console.error('Error clearing contact messages:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
