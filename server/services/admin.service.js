import { createOrder } from './order.service.js';
import { AppError } from '../utils/errors.js';

export async function createManualOrder({
  customerName,
  phoneNumber,
  orderSource,
  items,
  customerEmail = null,
  shippingAddress,
  deliveryFee = null,
}) {
  if (!customerName?.trim() || !phoneNumber?.trim()) {
    throw new AppError('Nom du client et numéro de téléphone sont requis', 400);
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('Au moins un article est requis', 400);
  }

  const MANUAL_ORDER_SOURCES = ['social_media', 'instagram', 'whatsapp', 'phone'];
  if (!MANUAL_ORDER_SOURCES.includes(orderSource)) {
    throw new AppError(
      "orderSource must be 'social_media', 'phone', 'instagram', or 'whatsapp'",
      400
    );
  }

  const orderNumber = `SLK-M-${Date.now().toString().slice(-8)}`;

  return createOrder({
    customer: {
      name: customerName.trim(),
      email: customerEmail?.trim() || null,
      phone: phoneNumber.trim(),
      address: shippingAddress?.trim() || 'Commande manuelle (hors ligne)',
    },
    items,
    userId: null,
    orderSource,
    deliveryFee,
    orderNumber,
  });
}
