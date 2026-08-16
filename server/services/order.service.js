import crypto from 'crypto';
import { orderRepository } from '../repositories/order.repository.js';
import { exchangeRepository } from '../repositories/exchange.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import { themeRepository } from '../repositories/theme.repository.js';
import { emailDeliveryRepository } from '../repositories/email-delivery.repository.js';
import { getCartItemsForCheckout, clearCart } from './cart.service.js';
import { runInTransaction } from '../repositories/transaction.repository.js';
import { AppError } from '../utils/errors.js';
import { sendOrderConfirmationEmail } from './email.service.js';

const EMAIL_TYPE_ORDER_CONFIRMATION = 'order_confirmation';

/**
 * Dispatch an order-confirmation email with PostgreSQL-backed idempotency.
 *
 * Guarantee: exactly 1 email per (order_id, 'order_confirmation') pair,
 * enforced by the UNIQUE constraint on order_email_deliveries.
 *
 * Steps:
 *   1. Skip silently if the order has no customer email address.
 *   2. INSERT a delivery record (ON CONFLICT DO NOTHING).
 *   3. If insert returned 0 rows → another process already claimed it → skip.
 *   4. If insert succeeded → we own the dispatch → call sendOrderConfirmationEmail.
 *   5. On success → mark the row 'sent'.
 *   6. On failure → mark the row 'failed' (safely retryable by deleting the row).
 *
 * This function never throws. Email failures are logged and do NOT affect the
 * already-committed order transaction.
 *
 * @param {object} order - Full formatted order object returned by the repository.
 */
export async function dispatchOrderConfirmationEmail(order) {
  if (!order?.id) return;
  const customerEmail = (order.customer?.email || order.customerEmail || '').trim();
  if (!customerEmail) return;

  let delivery = null;
  try {
    // Claim the dispatch slot — atomic at the DB level
    delivery = await emailDeliveryRepository.claimDelivery(
      order.id,
      EMAIL_TYPE_ORDER_CONFIRMATION
    );

    if (!delivery) {
      // Another process (or a previous call in the same process) already claimed
      // the dispatch for this order. Skip without sending.
      console.log(
        `[email] Order confirmation already claimed for order ${order.id} — skipping.`
      );
      return;
    }

    // We own the slot — send the email
    await sendOrderConfirmationEmail(order);
    await emailDeliveryRepository.markSent(delivery.id);
  } catch (err) {
    console.error('[email] Failed to send order confirmation email:', err.message);
    if (delivery?.id) {
      try {
        await emailDeliveryRepository.markFailed(delivery.id, err.message);
      } catch (updateErr) {
        console.error('[email] Failed to mark delivery as failed:', updateErr.message);
      }
    }
  }
}

function generateOrderNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${ts}-${rand}`;
}

export async function getAllOrders() {
  return orderRepository.findAll();
}

export async function getOrdersByUserId(userId) {
  return orderRepository.findByUserId(userId);
}

export async function getOrderById(id) {
  const order = await orderRepository.findById(id);
  if (!order) {
    throw new AppError('Commande non trouvée', 404);
  }
  return order;
}

export async function getOrderByIdForUser(id, userId) {
  const order = await orderRepository.findById(id);
  if (!order || (order.userId && order.userId !== userId)) {
    throw new AppError('Commande non trouvée', 404);
  }
  return order;
}

function extractCustomerInfo(customer) {
  if (!customer || typeof customer !== 'object') return {};
  const name = (customer.name || customer.fullName || [customer.firstName, customer.lastName].filter(Boolean).join(' '))?.trim();
  const phone = (customer.phone || customer.phoneNumber)?.trim();
  const email = (customer.email || customer.customerEmail)?.trim() || null;
  const address = (customer.address || customer.shippingAddress)?.trim();
  return { name, phone, email, address };
}

export async function createOrder({
  customer,
  items,
  userId = null,
  orderSource = 'web',
  deliveryFee: customDeliveryFee = null,
  orderNumber: customOrderNumber = null,
}) {
  const custInfo = extractCustomerInfo(customer);
  if (!custInfo.name || !custInfo.phone || !custInfo.address) {
    throw new AppError('Les informations client (nom, téléphone, adresse) sont requises', 400);
  }
  if (!items || !items.length) {
    throw new AppError('La commande doit contenir au moins un article', 400);
  }

  const order = await runInTransaction(async (tx) => {
    // Collect all variant IDs to lock
    const variantIds = items.map((i) => i.variantId).filter(Boolean);
    if (variantIds.length > 0) {
      await orderRepository.lockVariantsForUpdate(variantIds, tx);
    }

    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      let variant = null;
      if (item.variantId) {
        variant = await productRepository.findVariantById(item.variantId, tx);
      } else if (item.productId && item.colorId && item.size) {
        variant = await productRepository.findVariantForOrderItem(item.productId, item.colorId, item.size, tx);
      }

      if (!variant) {
        throw new AppError(`Article non trouvé (${item.name || item.productTitle || 'Variant'})`, 404);
      }

      const product = await productRepository.findById(variant.productId, tx);
      if (!product || !product.is_active) {
        throw new AppError(`Produit non disponible (${variant.sku})`, 400);
      }

      const quantity = Math.max(1, Number(item.quantity) || 1);
      if (variant.stockQuantity < quantity) {
        throw new AppError(
          `${product.name}: stock insuffisant (${variant.stockQuantity} disponible(s))`,
          400
        );
      }

      const unitPrice = Number(item.price) !== undefined && !isNaN(Number(item.price))
        ? Number(item.price)
        : (product.price - product.discount);

      const lineSubtotal = unitPrice * quantity;
      subtotal += lineSubtotal;

      // Deduct variant stock
      await productRepository.updateVariantStock(variant.id, variant.stockQuantity - quantity, tx);

      validatedItems.push({
        variantId: variant.id,
        name: product.name,
        variantLabel: `${variant.colorName} / ${variant.size}`,
        image: variant.colorImageUrl || product.collectionImage || product.mainImage || null,
        quantity,
        price: unitPrice,
      });
    }

    const deliveryFee = (customDeliveryFee !== null && customDeliveryFee !== undefined)
      ? Number(customDeliveryFee)
      : await themeRepository.getDeliveryFee(tx);
    const totalAmount = subtotal + deliveryFee;
    const orderNumber = customOrderNumber || generateOrderNumber();

    const createdOrder = await orderRepository.createOrder({
      orderNumber,
      userId,
      customerName: custInfo.name,
      customerEmail: custInfo.email,
      customerPhone: custInfo.phone,
      shippingAddress: custInfo.address,
      subtotal,
      deliveryFee,
      totalAmount,
      orderSource,
      status: 'pending',
    }, validatedItems, tx);

    return createdOrder;
  });

  dispatchOrderConfirmationEmail(order);
  return order;
}

export async function checkoutFromCart({ customer, shopper }) {
  const custInfo = extractCustomerInfo(customer);
  if (!custInfo.name || !custInfo.phone || !custInfo.address) {
    throw new AppError('Les informations client (nom, téléphone, adresse) sont requises', 400);
  }

  const order = await runInTransaction(async (tx) => {
    const { cartId, items } = await getCartItemsForCheckout(shopper, tx);
    if (!items.length) {
      throw new AppError('Votre panier est vide', 400);
    }

    const variantIds = items.map((i) => i.variantId).filter(Boolean);
    if (variantIds.length > 0) {
      await orderRepository.lockVariantsForUpdate(variantIds, tx);
    }

    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const variant = await productRepository.findVariantById(item.variantId, tx);
      if (!variant) {
        throw new AppError(`Article non trouvé (${item.name})`, 404);
      }

      if (variant.stockQuantity < item.quantity) {
        throw new AppError(
          `${item.name}: stock insuffisant (${variant.stockQuantity} disponible(s))`,
          400
        );
      }

      const unitPrice = item.price;
      subtotal += unitPrice * item.quantity;

      // Deduct stock
      await productRepository.updateVariantStock(variant.id, variant.stockQuantity - item.quantity, tx);

      validatedItems.push({
        variantId: variant.id,
        name: item.name,
        variantLabel: item.details,
        image: item.image,
        quantity: item.quantity,
        price: unitPrice,
      });
    }

    const deliveryFee = await themeRepository.getDeliveryFee(tx);
    const totalAmount = subtotal + deliveryFee;
    const orderNumber = generateOrderNumber();

    const createdOrder = await orderRepository.createOrder({
      orderNumber,
      userId: shopper.userId || null,
      guestSessionId: shopper.guestSessionId || null,
      customerName: custInfo.name,
      customerEmail: custInfo.email,
      customerPhone: custInfo.phone,
      shippingAddress: custInfo.address,
      subtotal,
      deliveryFee,
      totalAmount,
      orderSource: 'web',
      status: 'pending',
    }, validatedItems, tx);

    await clearCart(cartId, tx);

    return createdOrder;
  });

  dispatchOrderConfirmationEmail(order);
  return order;
}

function buildVariantLabel(colorName, size) {
  const parts = [];
  if (colorName) parts.push(colorName);
  if (size) parts.push(`Taille ${size}`);
  return parts.join(' · ') || 'Standard';
}

export async function checkoutDirect({ customer, shopper, item }) {
  const custInfo = extractCustomerInfo(customer);
  if (!custInfo.name || !custInfo.phone || !custInfo.address) {
    throw new AppError('Les informations client (nom, téléphone, adresse) sont requises', 400);
  }

  if (!item || !item.productId || !item.size) {
    throw new AppError('Article invalide pour achat direct', 400);
  }

  const quantity = Math.max(1, Math.floor(Number(item.quantity)) || 1);

  const order = await runInTransaction(async (tx) => {
    let variant = null;
    if (item.variantId) {
      variant = await productRepository.findVariantById(item.variantId, tx);
    } else {
      variant = await productRepository.findVariantForOrderItem(item.productId, item.colorId, item.size, tx);
    }

    if (!variant) {
      throw new AppError('Article non trouvé', 404);
    }

    const product = await productRepository.findById(variant.productId, tx);
    if (!product || !product.is_active) {
      throw new AppError('Produit non disponible', 400);
    }

    await orderRepository.lockVariantsForUpdate([variant.id], tx);

    const lockedVariant = await productRepository.findVariantById(variant.id, tx);
    if (!lockedVariant || lockedVariant.stockQuantity < quantity) {
      throw new AppError(
        `${product.name}: stock insuffisant (${lockedVariant?.stockQuantity ?? 0} disponible(s))`,
        400
      );
    }

    // Authoritative unit price directly from DB
    const unitPrice = parseFloat(product.price) - parseFloat(product.discount || 0);
    const subtotal = unitPrice * quantity;

    // Deduct variant stock
    await productRepository.updateVariantStock(variant.id, lockedVariant.stockQuantity - quantity, tx);

    const validatedItems = [{
      variantId: variant.id,
      name: product.name,
      variantLabel: buildVariantLabel(variant.colorName, variant.size),
      image: variant.colorImageUrl || product.collectionImage || product.mainImage || null,
      quantity,
      price: unitPrice,
    }];

    const deliveryFee = await themeRepository.getDeliveryFee(tx);
    const totalAmount = subtotal + deliveryFee;
    const orderNumber = generateOrderNumber();

    const createdOrder = await orderRepository.createOrder({
      orderNumber,
      userId: shopper?.userId || null,
      guestSessionId: shopper?.guestSessionId || null,
      customerName: custInfo.name,
      customerEmail: custInfo.email,
      customerPhone: custInfo.phone,
      shippingAddress: custInfo.address,
      subtotal,
      deliveryFee,
      totalAmount,
      orderSource: 'web',
      status: 'pending',
    }, validatedItems, tx);

    // Persistent cart is left completely untouched

    return createdOrder;
  });

  dispatchOrderConfirmationEmail(order);
  return order;
}

export async function cancelOrder(orderId) {
  return runInTransaction(async (tx) => {
    const lockedOrder = await orderRepository.findByIdForUpdate(orderId, tx);
    if (!lockedOrder) {
      throw new AppError('Commande non trouvée', 404);
    }

    if (lockedOrder.status === 'cancelled') {
      throw new AppError('La commande est déjà annulée', 400);
    }

    const latestExchange = await exchangeRepository.findLatestExchange(orderId, tx);

    let itemsToRestore = [];
    if (latestExchange && latestExchange.items && latestExchange.items.length > 0) {
      itemsToRestore = latestExchange.items;
    } else {
      const order = await orderRepository.findById(orderId, tx);
      itemsToRestore = order ? order.items || [] : [];
    }

    const quantityByVariant = new Map();
    for (const item of itemsToRestore) {
      if (item.variantId && Number(item.quantity) > 0) {
        quantityByVariant.set(
          item.variantId,
          (quantityByVariant.get(item.variantId) || 0) + Number(item.quantity)
        );
      }
    }

    const variantIds = Array.from(quantityByVariant.keys());

    if (variantIds.length > 0) {
      await orderRepository.lockVariantsForUpdate(variantIds, tx);
      for (const [variantId, qty] of quantityByVariant.entries()) {
        const variant = await productRepository.findVariantById(variantId, tx);
        if (variant) {
          await productRepository.updateVariantStock(variant.id, variant.stockQuantity + qty, tx);
        }
      }
    }

    await orderRepository.updateStatus(orderId, 'cancelled', tx);
    return orderRepository.findById(orderId, tx);
  });
}

export async function updateOrderStatus(orderId, status) {
  const allowed = ['pending', 'processing', 'completed', 'cancelled', 'exchanged'];
  if (!allowed.includes(status)) {
    throw new AppError('Statut de commande invalide', 400);
  }

  if (status === 'cancelled') {
    return cancelOrder(orderId);
  }

  const updated = await orderRepository.updateStatus(orderId, status);
  if (!updated) {
    throw new AppError('Commande non trouvée', 404);
  }
  return orderRepository.findById(orderId);
}
