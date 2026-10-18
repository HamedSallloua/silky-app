import '../config/env.js';
import pg from 'pg';
import { runExchangesMigration } from '../db/migrations/add_exchanges.js';
import { runRefundsMigration } from '../db/migrations/add_refunds.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await runExchangesMigration(pool);
await runRefundsMigration(pool);

const { rows: exRows } = await pool.query(
  `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'order_exchanges' ORDER BY ordinal_position`
);
console.log('order_exchanges columns:', JSON.stringify(exRows, null, 2));

const { rows: refRows } = await pool.query(
  `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'order_refunds' ORDER BY ordinal_position`
);
console.log('order_refunds columns:', JSON.stringify(refRows, null, 2));

await pool.end();

