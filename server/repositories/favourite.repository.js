import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { favourites, products } from '../models/index.js';

export const favouriteRepository = {
  async findByShopper({ userId = null, guestSessionId = null }, tx = db) {
    let condition;
    if (userId) {
      condition = eq(favourites.userId, userId);
    } else if (guestSessionId) {
      condition = eq(favourites.guestSessionId, guestSessionId);
    } else {
      return [];
    }

    const rows = await tx.select({
      id: favourites.id,
      productId: favourites.productId,
      createdAt: favourites.createdAt,
      productTitle: products.title,
      productSlug: products.slug,
      price: products.price,
      discountAmount: products.discountAmount,
      collectionImageUrl: products.collectionImageUrl,
      isFeatured: products.isFeatured,
      isActive: products.isActive,
    })
    .from(favourites)
    .innerJoin(products, eq(favourites.productId, products.id))
    .where(condition);

    return rows;
  },

  async add({ userId = null, guestSessionId = null }, productId, tx = db) {
    if (userId) {
      const [fav] = await tx.insert(favourites).values({
        userId,
        productId,
      })
      .onConflictDoNothing()
      .returning();
      return fav || null;
    }
    if (guestSessionId) {
      const [fav] = await tx.insert(favourites).values({
        guestSessionId,
        productId,
      })
      .onConflictDoNothing()
      .returning();
      return fav || null;
    }
    return null;
  },

  async remove({ userId = null, guestSessionId = null }, productId, tx = db) {
    let condition;
    if (userId) {
      condition = and(eq(favourites.userId, userId), eq(favourites.productId, productId));
    } else if (guestSessionId) {
      condition = and(eq(favourites.guestSessionId, guestSessionId), eq(favourites.productId, productId));
    } else {
      return null;
    }

    const [deleted] = await tx.delete(favourites).where(condition).returning();
    return deleted || null;
  },

  async exists({ userId = null, guestSessionId = null }, productId, tx = db) {
    let condition;
    if (userId) {
      condition = and(eq(favourites.userId, userId), eq(favourites.productId, productId));
    } else if (guestSessionId) {
      condition = and(eq(favourites.guestSessionId, guestSessionId), eq(favourites.productId, productId));
    } else {
      return false;
    }

    const [row] = await tx.select({ id: favourites.id }).from(favourites).where(condition);
    return !!row;
  },

  async mergeGuestFavouritesIntoUser(userId, guestSessionId, tx = db) {
    if (!userId || !guestSessionId) return;
    await tx.execute(sql`
      INSERT INTO favourites (user_id, product_id)
      SELECT ${userId}, product_id
      FROM favourites
      WHERE guest_session_id = ${guestSessionId}
      ON CONFLICT (user_id, product_id) WHERE user_id IS NOT NULL DO NOTHING
    `);
    await tx.delete(favourites).where(eq(favourites.guestSessionId, guestSessionId));
  }
};
