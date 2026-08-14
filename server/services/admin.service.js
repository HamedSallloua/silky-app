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

  const validSources = ['web', 'social_media', 'instagram', 'whatsapp', 'phone'];
  const finalSource = validSources.includes(orderSource) ? orderSource : 'phone';

  return createOrder({
    customer: {
      name: customerName.trim(),
      email: customerEmail?.trim() || null,
      phone: phoneNumber.trim(),
      address: shippingAddress?.trim() || 'Vente directe / Téléphone',
    },
    items,
    userId: null,
    orderSource: finalSource,
  });
}
