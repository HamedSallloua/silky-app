import { orderRepository } from '../repositories/order.repository.js';
import { exchangeRepository } from '../repositories/exchange.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import { themeRepository } from '../repositories/theme.repository.js';
import { runInTransaction } from '../repositories/transaction.repository.js';
import { AppError } from '../utils/errors.js';

function parseCustomerName(fullName = '') {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

function buildVariantLabel(variant) {
  const parts = [];
  if (variant.colorName) parts.push(variant.colorName);
  if (variant.size) parts.push(`Taille ${variant.size}`);
  return parts.join(' · ') || 'Standard';
}

export async function previewExchange({ orderId, customer, items, deliveryFee = null }) {
  if (!orderId) {
    throw new AppError('ID de commande requis', 400);
  }

  if (!customer?.customerName?.trim() || !customer?.phoneNumber?.trim() || !customer?.shippingAddress?.trim()) {
    throw new AppError('Informations du client incomplètes (nom, téléphone, adresse)', 400);
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('Au moins un article est requis pour l\'échange', 400);
  }

  for (const item of items) {
    if (!item.variantId || !item.quantity || Number(item.quantity) < 1) {
      throw new AppError('Chaque article doit avoir une variante valide et une quantité >= 1', 400);
    }
  }

  const order = await orderRepository.findById(orderId);
  if (!order) {
    throw new AppError('Commande introuvable', 404);
  }

  if (order.status !== 'completed' && order.status !== 'exchanged') {
    throw new AppError('Seules les commandes confirmées ou échangées peuvent faire l\'objet d\'un échange', 400);
  }

  const latestExchange = await exchangeRepository.findLatestExchange(orderId);

  let previousItems = [];
  if (latestExchange && latestExchange.items) {
    previousItems = latestExchange.items.map((r) => ({ variantId: r.variantId, quantity: Number(r.quantity) }));
  } else {
    previousItems = (order.items || []).map((r) => ({ variantId: r.variantId, quantity: Number(r.quantity) }));
  }

  const previousMap = new Map();
  for (const pItem of previousItems) {
    if (pItem.variantId) {
      previousMap.set(pItem.variantId, (previousMap.get(pItem.variantId) || 0) + Number(pItem.quantity));
    }
  }

  const newMap = new Map();
  for (const nItem of items) {
    if (nItem.variantId) {
      newMap.set(nItem.variantId, (newMap.get(nItem.variantId) || 0) + Number(nItem.quantity));
    }
  }

  const allVariantIds = Array.from(new Set([...previousMap.keys(), ...newMap.keys()])).sort();

  const variantDetailsMap = new Map();
  for (const variantId of allVariantIds) {
    const v = await productRepository.findVariantById(variantId);
    if (v) {
      const p = await productRepository.findById(v.productId);
      variantDetailsMap.set(variantId, { ...v, productTitle: p?.title || '', price: p?.price || 0, discountAmount: p?.discountAmount || 0 });
    }
  }

  for (const nItem of items) {
    if (!variantDetailsMap.has(nItem.variantId)) {
      throw new AppError(`Variante introuvable (${nItem.variantId})`, 400);
    }
  }

  for (const variantId of allVariantIds) {
    const prevQty = previousMap.get(variantId) || 0;
    const newQty = newMap.get(variantId) || 0;
    const netChange = prevQty - newQty;

    const v = variantDetailsMap.get(variantId);
    if (v && netChange < 0) {
      const needed = Math.abs(netChange);
      if (v.stockQuantity < needed) {
        throw new AppError(`${v.productTitle}: stock insuffisant (${v.stockQuantity} disponible(s))`, 400);
      }
    }
  }

  const resolvedExchangeItems = [];
  for (const item of items) {
    const v = variantDetailsMap.get(item.variantId);
    const unitPrice = Number(v.price) - Number(v.discountAmount);
    const variantLabel = buildVariantLabel(v);

    resolvedExchangeItems.push({
      variantId: v.id,
      productId: v.productId,
      name: v.productTitle,
      productTitle: v.productTitle,
      details: variantLabel,
      variantLabel,
      image: v.colorImageUrl || null,
      imageUrl: v.colorImageUrl || null,
      quantity: Number(item.quantity),
      price: unitPrice,
      unitPrice,
    });
  }

  const subtotal = resolvedExchangeItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const resolvedDeliveryFee = (deliveryFee !== null && deliveryFee !== undefined) ? Number(deliveryFee) : await themeRepository.getDeliveryFee();
  const totalAmount = subtotal + resolvedDeliveryFee;
  const sequence = latestExchange ? latestExchange.exchangeSequence + 1 : 1;
  const exchangeNumber = `EXCH-${order.orderNumber}-${sequence}`;
  const { firstName, lastName } = parseCustomerName(customer.customerName);

  return {
    exchangeNumber,
    exchangeSequence: sequence,
    orderNumber: order.orderNumber,
    customer: {
      firstName,
      lastName,
      name: customer.customerName.trim(),
      email: customer.customerEmail?.trim() || null,
      phone: customer.phoneNumber.trim(),
      address: customer.shippingAddress.trim(),
    },
    items: resolvedExchangeItems,
    subtotal,
    deliveryFee: resolvedDeliveryFee,
    total: totalAmount,
    createdAt: new Date().toISOString(),
  };
}

export async function createExchange({ orderId, customer, items, deliveryFee = null }) {
  if (!orderId) {
    throw new AppError('ID de commande requis', 400);
  }

  if (!customer?.customerName?.trim() || !customer?.phoneNumber?.trim() || !customer?.shippingAddress?.trim()) {
    throw new AppError('Informations du client incomplètes (nom, téléphone, adresse)', 400);
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('Au moins un article est requis pour l\'échange', 400);
  }

  return runInTransaction(async (tx) => {
    const lockedOrder = await orderRepository.findByIdForUpdate(orderId, tx);
    if (!lockedOrder) {
      throw new AppError('Commande introuvable', 404);
    }

    if (lockedOrder.status !== 'completed' && lockedOrder.status !== 'exchanged') {
      throw new AppError('Seules les commandes confirmées ou échangées peuvent faire l\'objet d\'un échange', 400);
    }

    const latestExchange = await exchangeRepository.findLatestExchange(orderId, tx);

    let previousItems = [];
    if (latestExchange && latestExchange.items) {
      previousItems = latestExchange.items.map((r) => ({ variantId: r.variantId, quantity: Number(r.quantity) }));
    } else {
      const currentOrder = await orderRepository.findById(orderId, tx);
      previousItems = (currentOrder.items || []).map((r) => ({ variantId: r.variantId, quantity: Number(r.quantity) }));
    }

    const previousMap = new Map();
    for (const pItem of previousItems) {
      if (pItem.variantId) {
        previousMap.set(pItem.variantId, (previousMap.get(pItem.variantId) || 0) + Number(pItem.quantity));
      }
    }

    const newMap = new Map();
    for (const nItem of items) {
      if (nItem.variantId) {
        newMap.set(nItem.variantId, (newMap.get(nItem.variantId) || 0) + Number(nItem.quantity));
      }
    }

    const allVariantIds = Array.from(new Set([...previousMap.keys(), ...newMap.keys()])).sort();

    if (allVariantIds.length > 0) {
      await orderRepository.lockVariantsForUpdate(allVariantIds, tx);
    }

    const variantDetailsMap = new Map();
    for (const variantId of allVariantIds) {
      const v = await productRepository.findVariantById(variantId, tx);
      if (v) {
        const p = await productRepository.findById(v.productId, tx);
        variantDetailsMap.set(variantId, { ...v, productTitle: p?.title || '', price: p?.price || 0, discountAmount: p?.discountAmount || 0 });
      }
    }

    for (const nItem of items) {
      if (!variantDetailsMap.has(nItem.variantId)) {
        throw new AppError(`Variante introuvable (${nItem.variantId})`, 400);
      }
    }

    for (const variantId of allVariantIds) {
      const prevQty = previousMap.get(variantId) || 0;
      const newQty = newMap.get(variantId) || 0;
      const netChange = prevQty - newQty;

      const v = variantDetailsMap.get(variantId);
      if (v) {
        if (netChange < 0) {
          const needed = Math.abs(netChange);
          if (v.stockQuantity < needed) {
            throw new AppError(`${v.productTitle}: stock insuffisant (${v.stockQuantity} disponible(s))`, 400);
          }
        }
        // Apply stock adjustment: new stock = current stock + netChange (positive restores stock, negative deducts stock)
        const updatedStock = v.stockQuantity + netChange;
        await productRepository.updateVariantStock(variantId, updatedStock, tx);
      }
    }

    const resolvedExchangeItems = [];
    for (const item of items) {
      const v = variantDetailsMap.get(item.variantId);
      const unitPrice = Number(v.price) - Number(v.discountAmount);
      const variantLabel = buildVariantLabel(v);

      resolvedExchangeItems.push({
        variantId: v.id,
        productId: v.productId,
        name: v.productTitle,
        productTitle: v.productTitle,
        details: variantLabel,
        variantLabel,
        image: v.colorImageUrl || null,
        imageUrl: v.colorImageUrl || null,
        quantity: Number(item.quantity),
        price: unitPrice,
        unitPrice,
      });
    }

    const subtotal = resolvedExchangeItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const resolvedDeliveryFee = (deliveryFee !== null && deliveryFee !== undefined) ? Number(deliveryFee) : await themeRepository.getDeliveryFee(tx);
    const totalAmount = subtotal + resolvedDeliveryFee;
    const sequence = latestExchange ? latestExchange.exchangeSequence + 1 : 1;
    const exchangeNumber = `EXCH-${lockedOrder.orderNumber}-${sequence}`;

    await exchangeRepository.createExchangeRecord({
      orderId,
      exchangeNumber,
      exchangeSequence: sequence,
      customerName: customer.customerName.trim(),
      customerEmail: customer.customerEmail?.trim() || null,
      customerPhone: customer.phoneNumber.trim(),
      shippingAddress: customer.shippingAddress.trim(),
      subtotal,
      deliveryFee: resolvedDeliveryFee,
      totalAmount,
    }, resolvedExchangeItems, tx);

    await orderRepository.updateStatus(orderId, 'exchanged', tx);

    return orderRepository.findById(orderId, tx);
  });
}
