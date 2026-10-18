import { pool } from '../db/pool.js';
import { runDeliveredStatusMigration } from '../db/migrations/add_delivered_status.js';

async function main() {
  console.log('--- Checking current order_status enum values ---');
  const client = await pool.connect();
  try {
    const preCheck = await client.query(`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'order_status'
      ORDER BY e.enumsortorder;
    `);
    console.log('Current enum labels:', preCheck.rows.map(r => r.enumlabel));

    console.log('\n--- Executing runDeliveredStatusMigration(pool) ---');
    await runDeliveredStatusMigration(pool);
    console.log('runDeliveredStatusMigration completed successfully.');

    console.log('\n--- Verifying updated order_status enum values ---');
    const postCheck = await client.query(`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'order_status'
      ORDER BY e.enumsortorder;
    `);
    const labels = postCheck.rows.map(r => r.enumlabel);
    console.log('Updated enum labels:', labels);

    if (!labels.includes('delivered')) {
      throw new Error("Verification failed: 'delivered' is not present in order_status enum!");
    }
    console.log("✓ Verification SUCCESS: 'delivered' is present in order_status enum.");

    console.log('\n--- Verifying enum type casting ---');
    const castCheck = await client.query("SELECT 'delivered'::order_status AS status;");
    console.log("✓ Cast check SUCCESS:", castCheck.rows[0].status);

    console.log('\n--- Non-destructive orders table check ---');
    const countCheck = await client.query('SELECT count(*)::int AS count FROM orders;');
    console.log("✓ Orders table intact. Total existing orders:", countCheck.rows[0].count);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n[MIGRATION ERROR]:', err);
  process.exit(1);
});
