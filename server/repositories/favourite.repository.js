import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { favourites, products, categories, productVariants } from '../models/index.js';

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
      id: favourites.id,
      productId: favourites.productId,
      variantId: favourites.variantId,
      createdAt: favourites.createdAt,
      name: products.title,
      slug: products.slug,
      price: products.price,
      discount: products.discountAmount,
      collectionImage: products.collectionImageUrl,
      category: categories.slug,
      isActive: products.isActive,
      variantSize: productVariants.size,
      colorSlug: productVariants.colorSlug,
      colorName: productVariants.colorName,
      colorImageUrl: productVariants.colorImageUrl,
    })
    .from(favourites)
    .innerJoin(products, eq(favourites.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(productVariants, eq(favourites.variantId, productVariants.id))
    .where(condition)
    .orderBy(desc(favourites.createdAt));

    return rows.map((row) => {
      const price = Number(row.price);
      const discount = Number(row.discount || 0);
      const effectivePrice = discount > 0 ? price - discount : price;
      const image = row.colorImageUrl || row.collectionImage || '';

      return {
        id: row.id,
        favoriteId: row.id,
        productId: row.productId,
        variantId: row.variantId || null,
        name: row.name,
        slug: row.slug,
        category: row.category,
        price,
        discount,
        effectivePrice,
        image,
        colorSlug: row.colorSlug || null,
        colorId: row.colorSlug || null,
        colorName: row.colorName || '',
        size: row.variantSize || null,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      };
    });
  },

  async add({ userId = null, guestSessionId = null }, { productId, variantId = null }, tx = db) {
    if (!userId && !guestSessionId) return null;

    if (userId) {
      if (variantId) {
        const result = await tx.execute(sql`
          INSERT INTO favourites (user_id, product_id, variant_id)
          VALUES (${userId}, ${productId}, ${variantId})
          ON CONFLICT (user_id, variant_id) WHERE user_id IS NOT NULL AND variant_id IS NOT NULL DO NOTHING
          RETURNING *
        `);
        return result.rows?.[0] || null;
      } else {
        const result = await tx.execute(sql`
          INSERT INTO favourites (user_id, product_id, variant_id)
          VALUES (${userId}, ${productId}, NULL)
          ON CONFLICT (user_id, product_id) WHERE user_id IS NOT NULL AND variant_id IS NULL DO NOTHING
          RETURNING *
        `);
        return result.rows?.[0] || null;
      }
    }

    if (guestSessionId) {
      if (variantId) {
        const result = await tx.execute(sql`
          INSERT INTO favourites (guest_session_id, product_id, variant_id)
          VALUES (${guestSessionId}, ${productId}, ${variantId})
          ON CONFLICT (guest_session_id, variant_id) WHERE guest_session_id IS NOT NULL AND variant_id IS NOT NULL DO NOTHING
          RETURNING *
        `);
        return result.rows?.[0] || null;
      } else {
        const result = await tx.execute(sql`
          INSERT INTO favourites (guest_session_id, product_id, variant_id)
          VALUES (${guestSessionId}, ${productId}, NULL)
          ON CONFLICT (guest_session_id, product_id) WHERE guest_session_id IS NOT NULL AND variant_id IS NULL DO NOTHING
          RETURNING *
        `);
        return result.rows?.[0] || null;
      }
    }

    return null;
  },

  async remove({ userId = null, guestSessionId = null }, { favoriteId = null, variantId = null, productId = null }, tx = db) {
    let ownerCondition;
    if (userId) {
      ownerCondition = eq(favourites.userId, userId);
    } else if (guestSessionId) {
      ownerCondition = eq(favourites.guestSessionId, guestSessionId);
    } else {
      return null;
    }

    let condition;
    if (favoriteId) {
      condition = and(ownerCondition, eq(favourites.id, favoriteId));
    } else if (variantId) {
      condition = and(ownerCondition, eq(favourites.variantId, variantId));
    } else if (productId) {
      // Legacy product-only fallback: only remove records where variant_id IS NULL
      condition = and(ownerCondition, eq(favourites.productId, productId), isNull(favourites.variantId));
    } else {
      return null;
    }

    const [deleted] = await tx.delete(favourites).where(condition).returning();
    return deleted || null;
  },

  async exists({ userId = null, guestSessionId = null }, { productId = null, variantId = null, favoriteId = null }, tx = db) {
    let ownerCondition;
    if (userId) {
      ownerCondition = eq(favourites.userId, userId);
    } else if (guestSessionId) {
      ownerCondition = eq(favourites.guestSessionId, guestSessionId);
    } else {
      return false;
    }

    let condition;
    if (favoriteId) {
      condition = and(ownerCondition, eq(favourites.id, favoriteId));
    } else if (variantId) {
      condition = and(ownerCondition, eq(favourites.variantId, variantId));
    } else if (productId) {
      // Legacy product-only check: only match records where variant_id IS NULL
      condition = and(ownerCondition, eq(favourites.productId, productId), isNull(favourites.variantId));
    } else {
      return false;
    }

    const [row] = await tx.select({ id: favourites.id }).from(favourites).where(condition);
    return !!row;
  },

  async mergeGuestFavouritesIntoUser(userId, guestSessionId, tx = db) {
    if (!userId || !guestSessionId) return;

    // 1. Merge guest favorites with variant_id
    await tx.execute(sql`
      INSERT INTO favourites (user_id, product_id, variant_id)
      SELECT ${userId}, product_id, variant_id
      FROM favourites
      WHERE guest_session_id = ${guestSessionId} AND variant_id IS NOT NULL
      ON CONFLICT (user_id, variant_id) WHERE user_id IS NOT NULL AND variant_id IS NOT NULL DO NOTHING
    `);

    // 2. Merge legacy guest favorites with variant_id IS NULL
    await tx.execute(sql`
      INSERT INTO favourites (user_id, product_id, variant_id)
      SELECT ${userId}, product_id, NULL
      FROM favourites
      WHERE guest_session_id = ${guestSessionId} AND variant_id IS NULL
      ON CONFLICT (user_id, product_id) WHERE user_id IS NOT NULL AND variant_id IS NULL DO NOTHING
    `);

    // 3. Clean up merged guest favorites
    await tx.execute(sql`
      DELETE FROM favourites WHERE guest_session_id = ${guestSessionId}
    `);
  }
};
