import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'fs/promises';
import apiRoutes from './routes/index.js';
import { guestSessionMiddleware } from './middleware/guestSession.js';
import { UPLOADS_DIR } from './utils/upload.js';
import { env } from './config/env.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const app = express();

app.use(
  cors({
    origin: env.corsAllowedOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(PUBLIC_DIR));

app.use('/api', guestSessionMiddleware, apiRoutes);

// Global middleware error handler (handles body parser errors like 413 Payload Too Large)
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ error: 'Payload too large. Maximum allowed size is 100kb.' });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('[server error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

export async function ensureUploadsDir() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

export { app, env };
