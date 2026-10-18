import { notificationRepository } from '../repositories/notification.repository.js';

export async function createOrderNotification(order) {
  if (!order?.id) return null;

  // Explicit rule: do not create notifications for admin manual orders
  const isManual = Boolean(order.orderNumber?.startsWith('SLK-M-'));
  if (isManual) return null;

  const isGuest = !order.userId;
  const originLabel = isGuest ? 'Invité' : 'Client';
  const customerName = (order.customerName || order.customer?.name || '').trim();
  const title = 'Nouvelle commande';
  const message = customerName
    ? `Commande ${order.orderNumber || order.id} reçue (${originLabel}) - ${customerName}`
    : `Commande ${order.orderNumber || order.id} reçue (${originLabel})`;

  try {
    return await notificationRepository.createNotification({
      type: 'order',
      title,
      message,
      orderId: order.id,
      userId: order.userId || null,
      guestSessionId: order.guestSessionId || null,
    });
  } catch (err) {
    console.error('[notification] Failed to create order notification:', err.message);
    return null;
  }
}

export async function createReviewNotification(review) {
  if (!review?.id) return null;

  const authorName = (review.authorName || 'Client').trim();
  const rating = review.rating || 5;
  const title = 'Nouvel avis client';
  const message = `Avis ${rating}/5 reçu de ${authorName}`;

  try {
    return await notificationRepository.createNotification({
      type: 'review',
      title,
      message,
      reviewId: review.id,
    });
  } catch (err) {
    console.error('[notification] Failed to create store review notification:', err.message);
    return null;
  }
}

export async function createProductReviewNotification(review, productId) {
  if (!review?.id) return null;

  const resolvedProductId = productId || review.productId || null;
  const authorName = (review.authorName || 'Client').trim();
  const rating = review.rating || 5;
  const title = 'Nouvel avis produit';
  const message = `Avis ${rating}/5 reçu pour un produit (${authorName})`;

  try {
    return await notificationRepository.createNotification({
      type: 'product_review',
      title,
      message,
      reviewId: review.id,
      productId: resolvedProductId,
      userId: review.userId || null,
    });
  } catch (err) {
    console.error('[notification] Failed to create product review notification:', err.message);
    return null;
  }
}

export async function createContactMessageNotification(contactMessage) {
  if (!contactMessage?.id) return null;

  const fullName = `${contactMessage.firstName || ''} ${contactMessage.lastName || ''}`.trim() || 'Visiteur';
  const title = 'Nouveau message';
  const message = `Message reçu de ${fullName}`;

  try {
    return await notificationRepository.createNotification({
      type: 'contact_message',
      title,
      message,
      contactMessageId: contactMessage.id,
      userId: contactMessage.userId || null,
    });
  } catch (err) {
    console.error('[notification] Failed to create contact message notification:', err.message);
    return null;
  }
}

export async function getNotifications({ limit = 5 } = {}) {
  const [unreadCount, notifications] = await Promise.all([
    notificationRepository.getUnreadCount(),
    notificationRepository.getLatest(limit),
  ]);

  return {
    unreadCount,
    notifications,
  };
}

export async function getAllNotifications({ offset = 0, limit = 20 } = {}) {
  const [unreadCount, data] = await Promise.all([
    notificationRepository.getUnreadCount(),
    notificationRepository.getAll({ offset, limit }),
  ]);

  return {
    unreadCount,
    ...data,
  };
}

export async function getUnreadCount() {
  return notificationRepository.getUnreadCount();
}

export async function markRead(id) {
  return notificationRepository.markOneRead(id);
}

export async function markAllRead() {
  return notificationRepository.markAllRead();
}
