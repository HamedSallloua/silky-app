import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '../../.env') });

const isProduction = process.env.NODE_ENV === 'production';

const KNOWN_DEV_JWT_SECRETS = new Set([
  'silky-dev-jwt-secret-change-me',
  'silky-dev-jwt-secret-change-me-in-production',
  'change-me-to-a-long-random-secret',
  'secret',
  'jwtsecret',
]);

/**
 * Validates the JWT secret for production safety.
 * In development, allows fallback default secret.
 * In production, strictly requires a non-default, strong secret (min 16 chars).
 */
export function validateJwtSecret(rawSecret, isProd = isProduction) {
  const secret = (rawSecret !== undefined ? rawSecret : process.env.JWT_SECRET)?.trim();
  if (isProd) {
    if (!secret) {
      throw new Error('[FATAL] JWT_SECRET must be set in production.');
    }
    if (KNOWN_DEV_JWT_SECRETS.has(secret) || secret.length < 16) {
      throw new Error(
        '[FATAL] JWT_SECRET is using an insecure or default development value in production. Please configure a strong, random production secret.'
      );
    }
    return secret;
  }
  return secret || 'silky-dev-jwt-secret-change-me';
}

/**
 * Parses and validates CORS allowed origins.
 * Trims whitespace, ignores empty entries, compares origins exactly.
 * In production, fails fast if CORS_ALLOWED_ORIGINS is missing or empty.
 * In development, defaults to Vite development server origins.
 */
export function parseCorsOrigins(
  rawEnv,
  isProd = isProduction,
  appUrl = process.env.APP_URL
) {
  const envVal = rawEnv !== undefined ? rawEnv : process.env.CORS_ALLOWED_ORIGINS;
  if (envVal && typeof envVal === 'string') {
    const origins = envVal
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    if (origins.length > 0) {
      return origins;
    }
  }

  if (isProd) {
    throw new Error(
      '[FATAL] CORS_ALLOWED_ORIGINS must be set and non-empty in production. Set a comma-separated list of allowed origins (e.g. CORS_ALLOWED_ORIGINS="https://yourdomain.com").'
    );
  }

  const devOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
  if (appUrl) {
    try {
      const parsed = new URL(appUrl);
      devOrigins.add(parsed.origin);
    } catch {
      devOrigins.add(appUrl.trim());
    }
  }
  return Array.from(devOrigins).filter(Boolean);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3001,
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/silky',
  jwtSecret: validateJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@silky.tn',
  adminPassword: process.env.ADMIN_PASSWORD || 'silky-admin',
  guestSessionCookieName: process.env.GUEST_SESSION_COOKIE_NAME || 'silky_guest_session',
  passwordResetExpiresHours: Number(process.env.PASSWORD_RESET_EXPIRES_HOURS) || 1,
  isProduction,
  corsAllowedOrigins: parseCorsOrigins(),

  // Email / SMTP
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  emailFrom: process.env.EMAIL_FROM || (process.env.SMTP_USER ? `Silky <${process.env.SMTP_USER}>` : 'Silky <no-reply@silky.tn>'),
  emailReplyTo: process.env.EMAIL_REPLY_TO || undefined,
  appUrl: process.env.APP_URL || 'http://localhost:5173',
};
