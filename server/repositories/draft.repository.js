import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { drafts, draftItems, productVariants, products, orders } from '../models/index.js';

function formatDraft(draft, items = [], convertedOrder = null) {
  if (!draft) return null;

  const formattedItems = items.map((i) => {
    const rawUnitPrice = i.unitPrice !== null && i.unitPrice !== undefined ? parseFloat(i.unitPrice) : (
      i.productPrice !== null && i.productPrice !== undefined
        ? (parseFloat(i.productPrice) - parseFloat(i.productDiscount || 0))
        : null
    );
    const qty = Number(i.quantity) || 1;
    return {
      id: i.id,
      variantId: i.variantId,
      productTitle: i.productTitle || i.productName || i.pTitle || '',
      variantLabel: i.variantLabel || (i.colorName && i.size ? `${i.colorName} / ${i.size}` : ''),
      imageUrl: i.imageUrl || i.colorImageUrl || i.productCollectionImage || null,
      quantity: qty,
      unitPrice: rawUnitPrice,
      total: rawUnitPrice !== null ? rawUnitPrice * qty : null,
    };
  });

  const subtotal = formattedItems.reduce((sum, item) => sum + (item.total || 0), 0);
  const deliveryFee = draft.deliveryFee !== null && draft.deliveryFee !== undefined ? parseFloat(draft.deliveryFee) : null;

  let customerAmountToPay = null;
  if (convertedOrder) {
    customerAmountToPay = parseFloat(convertedOrder.totalAmount ?? convertedOrder.total) || 0;
  } else if (formattedItems.length > 0 && formattedItems.some((i) => i.unitPrice !== null)) {
    customerAmountToPay = subtotal + (deliveryFee !== null ? deliveryFee : 8);
  }

  return {
    id: draft.id,
    customerName: draft.customerName || '',
    phoneNumber: draft.phoneNumber || '',
    customerEmail: draft.customerEmail || '',
    governorate: draft.governorate || '',
    shippingAddress: draft.shippingAddress || '',
    deliveryFee,
    notes: draft.notes || '',
    convertedAt: draft.convertedAt || null,
    convertedOrderId: draft.convertedOrderId || null,
    convertedOrderNumber: convertedOrder?.orderNumber || null,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    subtotal: subtotal || null,
    total: customerAmountToPay,
    customerAmountToPay,
    items: formattedItems,
  };
}

export const draftRepository = {
  /**
   * Find all drafts (both active and converted), ordered by most recently updated first.
   */
  async findAllDrafts(tx = db) {
    const allDrafts = await tx
      .select()
      .from(drafts)
      .orderBy(desc(drafts.updatedAt));

    if (allDrafts.length === 0) return [];

    const draftIds = allDrafts.map((d) => d.id);
    const items = await tx
      .select({
        id: draftItems.id,
        draftId: draftItems.draftId,
        variantId: draftItems.variantId,
        productTitle: draftItems.productTitle,
        variantLabel: draftItems.variantLabel,
        imageUrl: draftItems.imageUrl,
        quantity: draftItems.quantity,
        unitPrice: draftItems.unitPrice,
        createdAt: draftItems.createdAt,
        colorName: productVariants.colorName,
        size: productVariants.size,
        colorImageUrl: productVariants.colorImageUrl,
        pTitle: products.title,
        productPrice: products.price,
        productDiscount: products.discountAmount,
        productCollectionImage: products.collectionImageUrl,
      })
      .from(draftItems)
      .leftJoin(productVariants, eq(draftItems.variantId, productVariants.id))
      .leftJoin(products, eq(productVariants.productId, products.id))
      .where(inArray(draftItems.draftId, draftIds));

    const itemsByDraftId = new Map();
    for (const item of items) {
      if (!itemsByDraftId.has(item.draftId)) {
        itemsByDraftId.set(item.draftId, []);
      }
      itemsByDraftId.get(item.draftId).push(item);
    }

    const convertedOrderIds = allDrafts.map((d) => d.convertedOrderId).filter(Boolean);
    const ordersMap = new Map();
    if (convertedOrderIds.length > 0) {
      const orderRows = await tx
        .select()
        .from(orders)
        .where(inArray(orders.id, convertedOrderIds));
      for (const ord of orderRows) {
        ordersMap.set(ord.id, ord);
      }
    }

    return allDrafts.map((d) =>
      formatDraft(d, itemsByDraftId.get(d.id) || [], d.convertedOrderId ? ordersMap.get(d.convertedOrderId) : null)
    );
  },

  /**
   * Alias for backwards compatibility.
   */
  async findAllActiveDrafts(tx = db) {
    return this.findAllDrafts(tx);
  },

  /**
   * Find a single draft by ID (including converted drafts).
   */
  async findDraftById(id, tx = db) {
    if (!id) return null;

    const [draft] = await tx
      .select()
      .from(drafts)
      .where(eq(drafts.id, id));

    if (!draft) return null;

    const items = await tx
      .select({
        id: draftItems.id,
        draftId: draftItems.draftId,
        variantId: draftItems.variantId,
        productTitle: draftItems.productTitle,
        variantLabel: draftItems.variantLabel,
        imageUrl: draftItems.imageUrl,
        quantity: draftItems.quantity,
        unitPrice: draftItems.unitPrice,
        createdAt: draftItems.createdAt,
        colorName: productVariants.colorName,
        size: productVariants.size,
        colorImageUrl: productVariants.colorImageUrl,
        pTitle: products.title,
        productPrice: products.price,
        productDiscount: products.discountAmount,
        productCollectionImage: products.collectionImageUrl,
      })
      .from(draftItems)
      .leftJoin(productVariants, eq(draftItems.variantId, productVariants.id))
      .leftJoin(products, eq(productVariants.productId, products.id))
      .where(eq(draftItems.draftId, id));

    let convertedOrder = null;
    if (draft.convertedOrderId) {
      const [ord] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, draft.convertedOrderId));
      convertedOrder = ord || null;
    }

    return formatDraft(draft, items, convertedOrder);
  },

  /**
   * Lock a draft row for update inside a transaction to prevent concurrent confirmation.
   */
  async findDraftByIdForUpdate(id, tx) {
    if (!id) return null;

    // Use raw query for row-level locking
    const result = await tx.execute(
      sql`SELECT * FROM drafts WHERE id = ${id} FOR UPDATE`
    );

    const draft = result?.rows?.[0];
    if (!draft) return null;

    const items = await tx
      .select({
        id: draftItems.id,
        draftId: draftItems.draftId,
        variantId: draftItems.variantId,
        productTitle: draftItems.productTitle,
        variantLabel: draftItems.variantLabel,
        imageUrl: draftItems.imageUrl,
        quantity: draftItems.quantity,
        unitPrice: draftItems.unitPrice,
        createdAt: draftItems.createdAt,
        colorName: productVariants.colorName,
        size: productVariants.size,
        colorImageUrl: productVariants.colorImageUrl,
        pTitle: products.title,
        productPrice: products.price,
        productDiscount: products.discountAmount,
        productCollectionImage: products.collectionImageUrl,
      })
      .from(draftItems)
      .leftJoin(productVariants, eq(draftItems.variantId, productVariants.id))
      .leftJoin(products, eq(productVariants.productId, products.id))
      .where(eq(draftItems.draftId, id));

    return formatDraft({
      id: draft.id,
      customerName: draft.customer_name,
      phoneNumber: draft.phone_number,
      customerEmail: draft.customer_email,
      governorate: draft.governorate,
      shippingAddress: draft.shipping_address,
      deliveryFee: draft.delivery_fee,
      notes: draft.notes,
      convertedAt: draft.converted_at,
      convertedOrderId: draft.converted_order_id,
      createdAt: draft.created_at,
      updatedAt: draft.updated_at,
    }, items);
  },

  /**
   * Create a new draft with optional items.
   */
  async createDraft(draftData, itemsData = [], tx = db) {
    const [createdDraft] = await tx
      .insert(drafts)
      .values({
        customerName: draftData.customerName?.trim() || null,
        phoneNumber: draftData.phoneNumber?.trim() || null,
        customerEmail: draftData.customerEmail?.trim() || null,
        governorate: draftData.governorate?.trim() || null,
        shippingAddress: draftData.shippingAddress?.trim() || null,
        deliveryFee: draftData.deliveryFee !== null && draftData.deliveryFee !== undefined && draftData.deliveryFee !== ''
          ? String(draftData.deliveryFee)
          : null,
        notes: draftData.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .returning();

    let createdItems = [];
    if (Array.isArray(itemsData) && itemsData.length > 0) {
      const rowsToInsert = itemsData
        .filter((item) => item.variantId)
        .map((item) => ({
          draftId: createdDraft.id,
          variantId: item.variantId,
          productTitle: item.productTitle || null,
          variantLabel: item.variantLabel || null,
          imageUrl: item.imageUrl || null,
          quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
          unitPrice: item.unitPrice !== null && item.unitPrice !== undefined ? String(item.unitPrice) : null,
        }));

      if (rowsToInsert.length > 0) {
        createdItems = await tx
          .insert(draftItems)
          .values(rowsToInsert)
          .returning();
      }
    }

    return this.findDraftById(createdDraft.id, tx);
  },

  /**
   * Update an existing draft and replace its items.
   */
  async updateDraft(id, draftData, itemsData = [], tx = db) {
    const [updatedDraft] = await tx
      .update(drafts)
      .set({
        customerName: draftData.customerName !== undefined ? (draftData.customerName?.trim() || null) : undefined,
        phoneNumber: draftData.phoneNumber !== undefined ? (draftData.phoneNumber?.trim() || null) : undefined,
        customerEmail: draftData.customerEmail !== undefined ? (draftData.customerEmail?.trim() || null) : undefined,
        governorate: draftData.governorate !== undefined ? (draftData.governorate?.trim() || null) : undefined,
        shippingAddress: draftData.shippingAddress !== undefined ? (draftData.shippingAddress?.trim() || null) : undefined,
        deliveryFee: draftData.deliveryFee !== undefined
          ? (draftData.deliveryFee !== null && draftData.deliveryFee !== '' ? String(draftData.deliveryFee) : null)
          : undefined,
        notes: draftData.notes !== undefined ? (draftData.notes?.trim() || null) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, id))
      .returning();

    if (!updatedDraft) return null;

    // Replace items if itemsData is provided
    if (Array.isArray(itemsData)) {
      await tx.delete(draftItems).where(eq(draftItems.draftId, id));

      const rowsToInsert = itemsData
        .filter((item) => item.variantId)
        .map((item) => ({
          draftId: id,
          variantId: item.variantId,
          productTitle: item.productTitle || null,
          variantLabel: item.variantLabel || null,
          imageUrl: item.imageUrl || null,
          quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
          unitPrice: item.unitPrice !== null && item.unitPrice !== undefined ? String(item.unitPrice) : null,
        }));

      if (rowsToInsert.length > 0) {
        await tx
          .insert(draftItems)
          .values(rowsToInsert)
          .returning();
      }
    }

    return this.findDraftById(id, tx);
  },

  /**
   * Mark a draft as converted to a real order.
   */
  async markConverted(id, orderId, tx = db) {
    const [updated] = await tx
      .update(drafts)
      .set({
        convertedAt: new Date(),
        convertedOrderId: orderId,
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, id))
      .returning();

    return updated ? this.findDraftById(id, tx) : null;
  },

  /**
   * Delete an unconverted draft.
   */
  async deleteDraft(id, tx = db) {
    if (!id) return;
    await tx.delete(drafts).where(eq(drafts.id, id));
  },

  /**
   * Find draft by converted order ID.
   */
  async findDraftByConvertedOrderId(orderId, tx = db) {
    if (!orderId) return null;
    const [draft] = await tx
      .select()
      .from(drafts)
      .where(eq(drafts.convertedOrderId, orderId));

    return draft ? this.findDraftById(draft.id, tx) : null;
  },

  /**
   * Record draft conversion in the persistent journal for State D recovery.
   */
  async recordDraftConversion(draftId, orderId, tx = db) {
    if (!draftId || !orderId) return;
    await tx.execute(sql`
      INSERT INTO draft_conversions (draft_id, order_id, created_at)
      VALUES (${draftId}, ${orderId}, NOW())
      ON CONFLICT (draft_id) DO UPDATE SET order_id = EXCLUDED.order_id
    `);
  },

  /**
   * Look up order ID from the conversion journal if convertedOrderId is missing on drafts table (State D recovery).
   */
  async findConversionOrderIdByDraftId(draftId, tx = db) {
    if (!draftId) return null;
    const result = await tx.execute(sql`
      SELECT order_id FROM draft_conversions WHERE draft_id = ${draftId}
    `);
    return result?.rows?.[0]?.order_id || null;
  },
};
