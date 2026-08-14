import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { orders, orderItems, orderExchanges, exchangeItems, productVariants, products } from '../models/index.js';

function formatOrder(order, items = [], exchanges = []) {
  if (!order) return null;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    guestSessionId: order.guestSessionId,
    customer: {
      name: order.customerName,
      email: order.customerEmail,
      phone: order.customerPhone,
      address: order.shippingAddress,
    },
    items: items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      name: i.productTitle,
      variantLabel: i.variantLabel,
      image: i.imageUrl,
      quantity: i.quantity,
      price: parseFloat(i.unitPrice),
      total: parseFloat(i.unitPrice) * i.quantity,
    })),
    subtotal: parseFloat(order.subtotal),
    deliveryFee: parseFloat(order.deliveryFee),
    total: parseFloat(order.totalAmount),
    orderSource: order.orderSource,
    status: order.status,
    exchanges: exchanges.map((e) => ({
      id: e.id,
      exchangeNumber: e.exchangeNumber,
      exchangeSequence: e.exchangeSequence,
      customer: {
        name: e.customerName,
        email: e.customerEmail,
        phone: e.customerPhone,
        address: e.shippingAddress,
      },
      items: (e.items || []).map((ei) => ({
        id: ei.id,
        variantId: ei.variantId,
        name: ei.productTitle,
        variantLabel: ei.variantLabel,
        image: ei.imageUrl,
        quantity: ei.quantity,
        price: parseFloat(ei.unitPrice),
        total: parseFloat(ei.unitPrice) * ei.quantity,
      })),
      subtotal: parseFloat(e.subtotal),
      deliveryFee: parseFloat(e.deliveryFee),
      total: parseFloat(e.totalAmount),
      createdAt: e.createdAt,
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export const orderRepository = {
  async findAll(options = {}, tx = db) {
    const orderRows = await tx.select().from(orders).orderBy(desc(orders.createdAt));

    const result = [];
    for (const o of orderRows) {
      const full = await this.findById(o.id, tx);
      if (full) result.push(full);
    }
    return result;
  },

  async findByUserId(userId, tx = db) {
    if (!userId) return [];
    const orderRows = await tx.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));

    const result = [];
    for (const o of orderRows) {
      const full = await this.findById(o.id, tx);
      if (full) result.push(full);
    }
    return result;
  },

  async findById(id, tx = db) {
    if (!id) return null;
    const [order] = await tx.select().from(orders).where(eq(orders.id, id));
    if (!order) return null;

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));

    const exchangeRows = await tx.select().from(orderExchanges)
      .where(eq(orderExchanges.orderId, id))
      .orderBy(desc(orderExchanges.createdAt));

    const fullExchanges = [];
    for (const ex of exchangeRows) {
      const eItems = await tx.select().from(exchangeItems).where(eq(exchangeItems.exchangeId, ex.id));
      fullExchanges.push({ ...ex, items: eItems });
    }

    return formatOrder(order, items, fullExchanges);
  },

  async findByIdForUpdate(id, tx = db) {
    if (!id) return null;
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
    return order || null;
  },

  async lockVariantsForUpdate(variantIds, tx = db) {
    if (!variantIds || variantIds.length === 0) return [];
    return tx.select().from(productVariants).where(inArray(productVariants.id, variantIds)).for('update');
  },

  async createOrder({ orderNumber, userId = null, guestSessionId = null, customerName, customerEmail = null, customerPhone, shippingAddress, subtotal, deliveryFee = 0, totalAmount, orderSource = 'web', status = 'pending' }, items = [], tx = db) {
    const [newOrder] = await tx.insert(orders).values({
      orderNumber,
      userId,
      guestSessionId,
      customerName,
      customerEmail,
      customerPhone,
      shippingAddress,
      subtotal: subtotal.toString(),
      deliveryFee: deliveryFee.toString(),
      totalAmount: totalAmount.toString(),
      orderSource,
      status,
    }).returning();

    for (const item of items) {
      await tx.insert(orderItems).values({
        orderId: newOrder.id,
        variantId: item.variantId || null,
        productTitle: item.name || item.productTitle,
        variantLabel: item.variantLabel || null,
        imageUrl: item.image || item.imageUrl || null,
        quantity: item.quantity,
        unitPrice: item.price.toString(),
      });
    }

    return this.findById(newOrder.id, tx);
  },

  async updateStatus(id, status, tx = db) {
    const [updated] = await tx.update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updated || null;
  }
};
