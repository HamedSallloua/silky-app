import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { favourites, products, categories } from '../models/index.js';

export const favouriteRepository = {
  async findByShopper({ userId = null, guestSessionId = null }, tx = db) {
    let ownerCondition;
    if (userId) {
      ownerCondition = eq(favourites.userId, userId);
    } else if (guestSessionId) {
      ownerCondition = eq(favourites.guestSessionId, guestSessionId);
    } else {
      return [];
    }

    const condition = and(ownerCondition, eq(products.isActive, true));

    const rows = await tx.select({
      productId: favourites.productId,
      createdAt: favourites.createdAt,
      name: products.title,
      price: products.price,
      discount: products.discountAmount,
      image: products.collectionImageUrl,
      category: categories.slug,
    })
    .from(favourites)
    .innerJoin(products, eq(favourites.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(condition)
    .orderBy(desc(favourites.createdAt));

    return rows.map((row) => ({
      productId: row.productId,
      name: row.name,
      category: row.category,
      price: Number(row.price),
      discount: Number(row.discount || 0),
      image: row.image || '',
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    }));
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
