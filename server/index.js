import './config/env.js';
import { app, ensureUploadsDir, env } from './app.js';
import { verifyConnection } from './db/pool.js';

async function start() {
  await ensureUploadsDir();
  await verifyConnection();

  app.listen(env.port, () => {
    console.log(`Silky API running on http://localhost:${env.port}`);
    console.log(`Admin email: ${env.adminEmail} (seed with npm run db:seed)`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
