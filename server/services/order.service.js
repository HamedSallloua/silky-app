import crypto from 'crypto';
import { orderRepository } from '../repositories/order.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import { themeRepository } from '../repositories/theme.repository.js';
import { getCartItemsForCheckout, clearCart } from './cart.service.js';
import { runInTransaction } from '../repositories/transaction.repository.js';
import { AppError } from '../utils/errors.js';

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

export async function createOrder({ customer, items, userId = null, orderSource = 'web' }) {
  const custInfo = extractCustomerInfo(customer);
  if (!custInfo.name || !custInfo.phone || !custInfo.address) {
    throw new AppError('Les informations client (nom, téléphone, adresse) sont requises', 400);
  }
  if (!items || !items.length) {
    throw new AppError('La commande doit contenir au moins un article', 400);
  }

  return runInTransaction(async (tx) => {
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
      if (!product || !product.isActive) {
        throw new AppError(`Produit non disponible (${variant.sku})`, 400);
      }

      const quantity = Math.max(1, Number(item.quantity) || 1);
      if (variant.stockQuantity < quantity) {
        throw new AppError(
          `${product.title}: stock insuffisant (${variant.stockQuantity} disponible(s))`,
          400
        );
      }

      const unitPrice = Number(item.price) !== undefined && !isNaN(Number(item.price))
        ? Number(item.price)
        : (product.price - product.discountAmount);

      const lineSubtotal = unitPrice * quantity;
      subtotal += lineSubtotal;

      // Deduct variant stock
      await productRepository.updateVariantStock(variant.id, variant.stockQuantity - quantity, tx);

      validatedItems.push({
        variantId: variant.id,
        name: product.title,
        variantLabel: `${variant.colorName} / ${variant.size}`,
        image: variant.colorImageUrl || product.collectionImageUrl || null,
        quantity,
        price: unitPrice,
      });
    }

    const deliveryFee = await themeRepository.getDeliveryFee(tx);
    const totalAmount = subtotal + deliveryFee;
    const orderNumber = generateOrderNumber();

    const order = await orderRepository.createOrder({
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

    return order;
  });
}

export async function checkoutFromCart({ customer, shopper }) {
  const custInfo = extractCustomerInfo(customer);
  if (!custInfo.name || !custInfo.phone || !custInfo.address) {
    throw new AppError('Les informations client (nom, téléphone, adresse) sont requises', 400);
  }

  return runInTransaction(async (tx) => {
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

    const order = await orderRepository.createOrder({
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

    return order;
  });
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

    if (!['pending', 'processing'].includes(lockedOrder.status)) {
      throw new AppError(`Impossible d'annuler une commande avec le statut "${lockedOrder.status}"`, 400);
    }

    const order = await orderRepository.findById(orderId, tx);
    const variantIds = (order.items || []).map((i) => i.variantId).filter(Boolean);

    if (variantIds.length > 0) {
      await orderRepository.lockVariantsForUpdate(variantIds, tx);
      for (const item of order.items) {
        if (item.variantId) {
          const variant = await productRepository.findVariantById(item.variantId, tx);
          if (variant) {
            await productRepository.updateVariantStock(variant.id, variant.stockQuantity + item.quantity, tx);
          }
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
