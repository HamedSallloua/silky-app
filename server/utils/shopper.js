/** Resolves the active shopper identity from an Express request. */
export function resolveShopper(req) {
  if (req.user?.id) {
    return { userId: req.user.id, guestSessionId: null };
  }
  if (req.guestSessionId) {
    return { userId: null, guestSessionId: req.guestSessionId };
  }
  return { userId: null, guestSessionId: null };
}

export function requireShopper(req) {
  const shopper = resolveShopper(req);
  if (!shopper.userId && !shopper.guestSessionId) {
    const err = new Error('Session required');
    err.status = 400;
    throw err;
  }
  return shopper;
}
