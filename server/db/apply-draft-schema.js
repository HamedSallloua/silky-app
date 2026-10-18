import { runDraftTablesMigration } from './migrations/add_draft_tables.js';
import { pool } from './pool.js';

async function main() {
  console.log('[db] Applying draft tables migration...');
  try {
    await runDraftTablesMigration();
    console.log('[db] Draft tables migration applied successfully.');
  } catch (err) {
    console.error('[db] Draft tables migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
