import { createOrder } from './order.service.js';
import { resolveGovernorateSync } from '../config/governorates.js';
import { AppError } from '../utils/errors.js';

export async function createManualOrder({
  customerName,
  phoneNumber,
  items,
  customerEmail = null,
  governorateId = null,
  governorate = null,
  shippingAddress,
  deliveryFee = null,
}) {
  if (!customerName?.trim() || !phoneNumber?.trim()) {
    throw new AppError('Nom du client et numéro de téléphone sont requis', 400);
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('Au moins un article est requis', 400);
  }

  let resolvedGovId = null;
  let resolvedGovName = null;

  const rawGov = governorateId ?? governorate;
  if (rawGov !== null && rawGov !== undefined && (typeof rawGov !== 'string' || rawGov.trim() !== '')) {
    const resolved = resolveGovernorateSync(rawGov);
    if (!resolved) {
      throw new AppError('Gouvernorat invalide.', 400);
    }
    resolvedGovId = resolved.id;
    resolvedGovName = resolved.name;
  } else {
    throw new AppError('Le gouvernorat est obligatoire.', 400);
  }

  const orderNumber = `SLK-M-${Date.now().toString().slice(-8)}`;

  return createOrder({
    customer: {
      name: customerName.trim(),
      email: customerEmail?.trim() || null,
      phone: phoneNumber.trim(),
      address: shippingAddress?.trim() || 'Commande manuelle (hors ligne)',
      governorateId: resolvedGovId,
      governorate: resolvedGovName,
    },
    items,
    userId: null,
    deliveryFee,
    orderNumber,
    allowCustomPrices: true,
  });
}

