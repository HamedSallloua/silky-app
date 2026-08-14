import crypto from 'crypto';
import { env } from '../config/env.js';

const COOKIE_NAME = env.guestSessionCookieName;

export function guestSessionMiddleware(req, res, next) {
  let sessionId =
    req.headers['x-guest-session-id'] ||
    req.cookies?.[COOKIE_NAME];

  if (!sessionId) {
    sessionId = crypto.randomUUID();
  }

  req.guestSessionId = sessionId;

  // Always (re)set the cookie so it stays fresh across browser restarts,
  // and always echo the session ID back in the response header so the
  // frontend can reliably persist it in localStorage.
  res.cookie(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60 * 1000,
    secure: env.isProduction,
  });
  res.setHeader('X-Guest-Session-ID', sessionId);

  next();
}
