import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { reviews, storeReviews, reviewGallery } from '../models/index.js';

export const reviewRepository = {
  async getPublishedStoreReviews(tx = db) {
    return tx.select().from(storeReviews).where(eq(storeReviews.status, 'approved')).orderBy(desc(storeReviews.createdAt));
  },

  async getAllStoreReviews(tx = db) {
    return tx.select().from(storeReviews).orderBy(desc(storeReviews.createdAt));
  },

  async createStoreReview({ authorName, email = '', body, rating = 5 }, tx = db) {
    const [review] = await tx.insert(storeReviews).values({
      authorName,
      email,
      body,
      rating,
      status: 'pending',
    }).returning();
    return review;
  },

  async updateStoreReviewStatus(id, status, tx = db) {
    const [updated] = await tx.update(storeReviews)
      .set({ status, updatedAt: new Date() })
      .where(eq(storeReviews.id, id))
      .returning();
    return updated || null;
  },

  async deleteStoreReview(id, tx = db) {
    const [deleted] = await tx.delete(storeReviews).where(eq(storeReviews.id, id)).returning();
    return deleted || null;
  },

  async getProductReviews(productId, tx = db) {
    const rows = await tx.select().from(reviews)
      .where(and(eq(reviews.productId, productId), eq(reviews.isApproved, true)))
      .orderBy(desc(reviews.createdAt));

    const [{ avgRating, count }] = await tx.select({
      avgRating: sql`AVG(rating)::numeric(3,2)`,
      count: sql`COUNT(*)`
    }).from(reviews).where(and(eq(reviews.productId, productId), eq(reviews.isApproved, true)));

    return {
      reviews: rows,
      averageRating: parseFloat(avgRating || '0'),
      totalCount: parseInt(count || '0', 10),
    };
  },

  async getAllProductReviews(productId, tx = db) {
    return tx.select().from(reviews).where(eq(reviews.productId, productId)).orderBy(desc(reviews.createdAt));
  },

  async createProductReview({ productId, userId = null, authorName = 'Client', rating, comment }, tx = db) {
    const [review] = await tx.insert(reviews).values({
      productId,
      userId,
      authorName,
      rating,
      comment,
      isApproved: false,
      status: 'pending',
      showInGeneral: false,
    }).returning();
    return review;
  },

  async updateProductReview(id, { status, showInGeneral }, tx = db) {
    const updateFields = { updatedAt: new Date() };
    if (status !== undefined) {
      updateFields.status = status;
      updateFields.isApproved = status === 'approved';
    }
    if (showInGeneral !== undefined) {
      updateFields.showInGeneral = !!showInGeneral;
    }

    const [updated] = await tx.update(reviews)
      .set(updateFields)
      .where(eq(reviews.id, id))
      .returning();
    return updated || null;
  },

  async deleteProductReview(id, tx = db) {
    const [deleted] = await tx.delete(reviews).where(eq(reviews.id, id)).returning();
    return deleted || null;
  }
};
