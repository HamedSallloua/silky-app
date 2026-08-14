import '../config/env.js';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const { rows } = await pool.query(
  `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'order_exchanges' ORDER BY ordinal_position`
);
console.log('order_exchanges columns:', JSON.stringify(rows, null, 2));
await pool.end();
