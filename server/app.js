import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'fs/promises';
import apiRoutes from './routes/index.js';
import { guestSessionMiddleware } from './middleware/guestSession.js';
import { UPLOADS_DIR } from './utils/upload.js';
import { env } from './config/env.js';

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(UPLOADS_DIR));

app.use('/api', guestSessionMiddleware, apiRoutes);

export async function ensureUploadsDir() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

export { app, env };
