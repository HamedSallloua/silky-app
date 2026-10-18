import crypto from 'crypto';
import { env } from '../config/env.js';

const COOKIE_NAME = env.guestSessionCookieName;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

export function guestSessionMiddleware(req, res, next) {
  const headerId = req.headers['x-guest-session-id'];
  const cookieId = req.cookies?.[COOKIE_NAME];

  let sessionId = null;

  if (isValidUUID(headerId)) {
    sessionId = headerId;
  } else if (isValidUUID(cookieId)) {
    sessionId = cookieId;
  } else {
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
