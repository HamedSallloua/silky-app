import { eq, and, or, ilike, inArray, sql, desc, asc } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { products, productVariants, productImages, categories } from '../models/index.js';

export function getStockKey(size, colorSlug) {
  return `${size}::${colorSlug}`;
}

export const productRepository = {
  async findAll({ includeHidden = true } = {}, tx = db) {
    let condition;
    if (!includeHidden) {
      condition = eq(products.isActive, true);
    }

    const rows = await tx.select().from(products).where(condition).orderBy(desc(products.createdAt));

    const result = [];
    for (const p of rows) {
      const fullProduct = await this.findById(p.id, tx);
      if (fullProduct) result.push(fullProduct);
    }
    return result;
  },

  async listPaginated({ category, search, page = 1, limit = 24, includeHidden = false } = {}, tx = db) {
    const offset = (page - 1) * limit;

    const conditions = [];
    if (!includeHidden) {
      conditions.push(eq(products.isActive, true));
    }
    if (category) {
      const [cat] = await tx.select().from(categories).where(eq(categories.slug, category));
      if (cat) {
        conditions.push(eq(products.categoryId, cat.id));
      } else {
        return { products: [], total: 0, page, limit, totalPages: 0 };
      }
    }
    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(or(
        ilike(products.title, searchPattern),
        ilike(products.description, searchPattern)
      ));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ count }] = await tx.select({ count: sql`count(*)` }).from(products).where(whereClause);
    const total = parseInt(count || '0', 10);

    const rows = await tx.select()
      .from(products)
      .where(whereClause)
      .orderBy(desc(products.createdAt))
      .limit(limit)
      .offset(offset);

    const productList = [];
    for (const p of rows) {
      const full = await this.findById(p.id, tx);
      if (full) productList.push(full);
    }

    return {
      products: productList,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    };
  },

  async findById(id, tx = db) {
    if (!id) return null;
    const [product] = await tx.select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      description: products.description,
      price: products.price,
      discountAmount: products.discountAmount,
      categoryId: products.categoryId,
      categoryName: categories.name,
      categorySlug: categories.slug,
      collectionImageUrl: products.collectionImageUrl,
      isFeatured: products.isFeatured,
      isActive: products.isActive,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id));

    if (!product) return null;

    const variants = await tx.select().from(productVariants).where(eq(productVariants.productId, id));
    const images = await tx.select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.sortOrder));

    // Construct color map
    const colorMap = new Map();
    const stockMap = {};
    const stock = {};

    for (const v of variants) {
      stockMap[getStockKey(v.size, v.colorSlug)] = v.stockQuantity;
      const stockKey = v.colorSlug && v.size ? `${v.colorSlug}-${v.size}` : (v.colorSlug || v.size || 'default');
      stock[stockKey] = v.stockQuantity;

      if (!colorMap.has(v.colorSlug)) {
        colorMap.set(v.colorSlug, {
          id: v.colorSlug,
          name: v.colorName,
          slug: v.colorSlug,
          imageUrl: v.colorImageUrl || null,
        });
      }
    }

    // Attach primary image fallback to colors if missing
    const primaryImg = images.find((i) => i.isPrimary) || images[0];
    const colors = Array.from(colorMap.values()).map((c) => {
      if (!c.imageUrl) {
        const colorSpecificImg = images.find((i) => i.colorSlug === c.slug);
        c.imageUrl = colorSpecificImg?.imageUrl || primaryImg?.imageUrl || null;
      }
      return c;
    });

    const sizes = Array.from(new Set(variants.map((v) => v.size)));

    return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      description: product.description,
      price: parseFloat(product.price),
      discountAmount: parseFloat(product.discountAmount || 0),
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      categorySlug: product.categorySlug,
      collectionImageUrl: product.collectionImageUrl,
      isFeatured: product.isFeatured,
      isActive: product.isActive,
      colors,
      sizes,
      stock,
      stockMap,
      variants,
      images,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  },

  async findBySlug(slug, tx = db) {
    if (!slug) return null;
    const [p] = await tx.select({ id: products.id }).from(products).where(eq(products.slug, slug));
    if (!p) return null;
    return this.findById(p.id, tx);
  },

  async findVariantById(variantId, tx = db) {
    if (!variantId) return null;
    const [variant] = await tx.select().from(productVariants).where(eq(productVariants.id, variantId));
    return variant || null;
  },

  async findVariantForOrderItem(productId, colorId, size, tx = db) {
    if (!productId || !size) return null;
    const conditions = [
      eq(productVariants.productId, productId),
      eq(productVariants.size, size)
    ];
    if (colorId) {
      conditions.push(eq(productVariants.colorSlug, colorId));
    }

    const [v] = await tx.select().from(productVariants).where(and(...conditions));
    return v || null;
  },

  async lockVariantsForUpdate(variantIds, tx = db) {
    if (!variantIds || variantIds.length === 0) return [];
    return tx.select()
      .from(productVariants)
      .where(inArray(productVariants.id, variantIds))
      .for('update');
  },

  async updateVariantStock(variantId, stockQuantity, tx = db) {
    const [updated] = await tx.update(productVariants)
      .set({ stockQuantity, updatedAt: new Date() })
      .where(eq(productVariants.id, variantId))
      .returning();
    return updated || null;
  },

  async createProduct({ title, slug, description = '', price, discountAmount = 0, categoryId, collectionImageUrl = null, isFeatured = false, isActive = true, variants = [], images = [] }, tx = db) {
    const [product] = await tx.insert(products).values({
      title,
      slug,
      description,
      price: price.toString(),
      discountAmount: discountAmount.toString(),
      categoryId,
      collectionImageUrl,
      isFeatured,
      isActive,
    }).returning();

    for (const v of variants) {
      await tx.insert(productVariants).values({
        productId: product.id,
        size: v.size,
        colorSlug: v.colorSlug || v.colorId,
        colorName: v.colorName || v.colorSlug || v.colorId,
        colorImageUrl: v.colorImageUrl || null,
        stockQuantity: v.stockQuantity ?? v.stock ?? 0,
        sku: v.sku || `${slug}-${v.size}-${v.colorSlug || v.colorId}`,
      });
    }

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      await tx.insert(productImages).values({
        productId: product.id,
        imageUrl: typeof img === 'string' ? img : img.imageUrl,
        colorSlug: typeof img === 'object' ? img.colorSlug : null,
        sortOrder: typeof img === 'object' && img.sortOrder !== undefined ? img.sortOrder : i,
        isPrimary: typeof img === 'object' ? !!img.isPrimary : i === 0,
      });
    }

    return this.findById(product.id, tx);
  },

  async updateProduct(id, payload, tx = db) {
    const updateFields = {};
    if (payload.title !== undefined) updateFields.title = payload.title;
    if (payload.slug !== undefined) updateFields.slug = payload.slug;
    if (payload.description !== undefined) updateFields.description = payload.description;
    if (payload.price !== undefined) updateFields.price = payload.price.toString();
    if (payload.discountAmount !== undefined) updateFields.discountAmount = payload.discountAmount.toString();
    if (payload.categoryId !== undefined) updateFields.categoryId = payload.categoryId;
    if (payload.collectionImageUrl !== undefined) updateFields.collectionImageUrl = payload.collectionImageUrl;
    if (payload.isFeatured !== undefined) updateFields.isFeatured = payload.isFeatured;
    if (payload.isActive !== undefined) updateFields.isActive = payload.isActive;
    updateFields.updatedAt = new Date();

    if (Object.keys(updateFields).length > 1) {
      await tx.update(products).set(updateFields).where(eq(products.id, id));
    }

    if (payload.variants && Array.isArray(payload.variants)) {
      await tx.delete(productVariants).where(eq(productVariants.productId, id));
      for (const v of payload.variants) {
        await tx.insert(productVariants).values({
          productId: id,
          size: v.size,
          colorSlug: v.colorSlug || v.colorId,
          colorName: v.colorName || v.colorSlug || v.colorId,
          colorImageUrl: v.colorImageUrl || null,
          stockQuantity: v.stockQuantity ?? v.stock ?? 0,
          sku: v.sku || `${payload.slug || id}-${v.size}-${v.colorSlug || v.colorId}`,
        });
      }
    }

    if (payload.images && Array.isArray(payload.images)) {
      await tx.delete(productImages).where(eq(productImages.productId, id));
      for (let i = 0; i < payload.images.length; i++) {
        const img = payload.images[i];
        await tx.insert(productImages).values({
          productId: id,
          imageUrl: typeof img === 'string' ? img : img.imageUrl,
          colorSlug: typeof img === 'object' ? img.colorSlug : null,
          sortOrder: typeof img === 'object' && img.sortOrder !== undefined ? img.sortOrder : i,
          isPrimary: typeof img === 'object' ? !!img.isPrimary : i === 0,
        });
      }
    }

    return this.findById(id, tx);
  },

  async deleteProduct(id, tx = db) {
    const [deleted] = await tx.delete(products).where(eq(products.id, id)).returning();
    return deleted || null;
  }
};
