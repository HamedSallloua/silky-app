import crypto from 'crypto';
import { AppError } from './errors.js';

/**
 * Validates the Idempotency-Key header value.
 * Must be a non-empty string between 1 and 255 characters with safe printable characters.
 */
export function validateIdempotencyKey(key) {
  if (key === undefined || key === null) {
    return null;
  }

  if (typeof key !== 'string') {
    throw new AppError('Clé d\'idempotence invalide (doit être une chaîne)', 400);
  }

  const trimmed = key.trim();
  if (trimmed.length === 0 || trimmed.length > 255) {
    throw new AppError('Clé d\'idempotence invalide (longueur entre 1 et 255 caractères)', 400);
  }

  // Allow standard ASCII printable characters excluding control characters
  if (!/^[\x21-\x7E\s]+$/.test(trimmed)) {
    throw new AppError('Clé d\'idempotence contient des caractères invalides', 400);
  }

  return trimmed;
}

/**
 * Deterministic normalized request fingerprint generator.
 * Produces a SHA-256 hash representing the actual business intent of the checkout request.
 */
export function generateRequestFingerprint(operation, data = {}) {
  const normalized = {
    op: String(operation || '').trim(),
    customer: {
      name: String(data.customer?.name || data.customer?.fullName || [data.customer?.firstName, data.customer?.lastName].filter(Boolean).join(' ') || '').trim().toLowerCase(),
      phone: String(data.customer?.phone || data.customer?.phoneNumber || '').trim(),
      email: String(data.customer?.email || data.customer?.customerEmail || '').trim().toLowerCase(),
      address: String(data.customer?.address || data.customer?.shippingAddress || '').trim().toLowerCase(),
      governorateId: String(data.customer?.governorateId || data.customer?.governorate || '').trim().toLowerCase(),
    },
  };

  if (Array.isArray(data.items)) {
    normalized.items = data.items
      .map((item) => ({
        variantId: item.variantId ? String(item.variantId).trim() : null,
        productId: item.productId ? String(item.productId).trim() : null,
        colorId: item.colorId ? String(item.colorId).trim() : null,
        size: item.size ? String(item.size).trim() : null,
        quantity: Math.max(1, Math.floor(Number(item.quantity)) || 1),
      }))
      .sort((a, b) => {
        const keyA = a.variantId || `${a.productId}-${a.colorId}-${a.size}`;
        const keyB = b.variantId || `${b.productId}-${b.colorId}-${b.size}`;
        return keyA.localeCompare(keyB);
      });
  } else if (data.item) {
    const item = data.item;
    normalized.items = [{
      variantId: item.variantId ? String(item.variantId).trim() : null,
      productId: item.productId ? String(item.productId).trim() : null,
      colorId: item.colorId ? String(item.colorId).trim() : null,
      size: item.size ? String(item.size).trim() : null,
      quantity: Math.max(1, Math.floor(Number(item.quantity)) || 1),
    }];
  }

  if (data.cartId) {
    normalized.cartId = String(data.cartId).trim();
  }

  const canonicalJson = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(canonicalJson).digest('hex');
}
