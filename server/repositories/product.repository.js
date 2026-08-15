import {
    eq,
    and,
    or,
    ilike,
    inArray,
    sql,
    desc,
    asc,
} from 'drizzle-orm';

import { db } from '../db/orm.js';

import {
    products,
    productVariants,
    productImages,
    categories,
} from '../models/index.js';

/**
 * Stock key used by the frontend.
 *
 * Frontend expects:
 *
 *     black-S
 *     black-M
 *     black-L
 *
 *     red-S
 *     red-M
 *
 * If only color exists:
 *
 *     black
 *
 * If only size exists:
 *
 *     M
 *
 * Otherwise:
 *
 *     default
 */
export function getStockKey(colorId, size) {
    if (colorId && size) {
        return `${colorId}-${size}`;
    }

    if (colorId) {
        return colorId;
    }

    if (size) {
        return size;
    }

    return 'default';
}

export const productRepository = {
    /* =====================================================
       CATEGORIES
       ===================================================== */

    async findCategoryBySlug(slug, tx = db) {
        if (!slug) {
            return null;
        }

        const [category] = await tx
            .select()
            .from(categories)
            .where(eq(categories.slug, slug));

        return category || null;
    },

    /* =====================================================
       PRODUCTS - READ
       ===================================================== */

    async findAll(
        { includeHidden = true } = {},
        tx = db
    ) {
        const rows = includeHidden
            ? await tx
                .select()
                .from(products)
                .orderBy(desc(products.createdAt))
            : await tx
                .select()
                .from(products)
                .where(eq(products.isActive, true))
                .orderBy(desc(products.createdAt));

        const result = [];

        for (const product of rows) {
            const fullProduct = await this.findById(
                product.id,
                tx
            );

            if (fullProduct) {
                result.push(fullProduct);
            }
        }

        return result;
    },

    async listPaginated(
        {
            category,
            search,
            page = 1,
            limit = 24,
            includeHidden = false,
        } = {},
        tx = db
    ) {
        const safePage = Math.max(
            Number(page) || 1,
            1
        );

        const safeLimit = Math.min(
            Math.max(
                Number(limit) || 24,
                1
            ),
            100
        );

        const offset =
            (safePage - 1) *
            safeLimit;

        const conditions = [];

        if (!includeHidden) {
            conditions.push(
                eq(products.isActive, true)
            );
        }

        if (category) {
            const cat =
                await this.findCategoryBySlug(
                    category,
                    tx
                );

            if (!cat) {
                return {
                    products: [],
                    pagination: {
                        total: 0,
                        page: safePage,
                        limit: safeLimit,
                        totalPages: 0,
                    },
                };
            }

            conditions.push(
                eq(
                    products.categoryId,
                    cat.id
                )
            );
        }

        if (search) {
            const searchPattern =
                `%${search.trim()}%`;

            conditions.push(
                or(
                    ilike(
                        products.title,
                        searchPattern
                    ),
                    ilike(
                        products.description,
                        searchPattern
                    )
                )
            );
        }

        const whereClause =
            conditions.length
                ? and(...conditions)
                : undefined;

        const [{ count }] =
            await tx
                .select({
                    count: sql`count(*)`,
                })
                .from(products)
                .where(whereClause);

        const total =
            parseInt(
                count || '0',
                10
            );

        const rows =
            await tx
                .select()
                .from(products)
                .where(whereClause)
                .orderBy(
                    desc(products.createdAt)
                )
                .limit(safeLimit)
                .offset(offset);

        const productList = [];

        for (const product of rows) {
            const full =
                await this.findById(
                    product.id,
                    tx
                );

            if (full) {
                productList.push(full);
            }
        }

        const totalPages =
            Math.ceil(
                total / safeLimit
            );

        return {
            products: productList,

            pagination: {
                total,
                page: safePage,
                limit: safeLimit,
                totalPages,
            },
        };
    },

    /* =====================================================
       PRODUCT BY ID
       ===================================================== */

    async findById(id, tx = db) {
        if (!id) {
            return null;
        }

        const [product] =
            await tx
                .select({
                    id: products.id,
                    title: products.title,
                    slug: products.slug,
                    description: products.description,
                    price: products.price,
                    discountAmount:
                        products.discountAmount,
                    categoryId:
                        products.categoryId,
                    categoryName:
                        categories.name,
                    categorySlug:
                        categories.slug,
                    collectionImageUrl:
                        products.collectionImageUrl,
                    isFeatured:
                        products.isFeatured,
                    isActive:
                        products.isActive,
                    createdAt:
                        products.createdAt,
                    updatedAt:
                        products.updatedAt,
                })
                .from(products)
                .leftJoin(
                    categories,
                    eq(
                        products.categoryId,
                        categories.id
                    )
                )
                .where(
                    eq(products.id, id)
                );

        if (!product) {
            return null;
        }

        const variants =
            await tx
                .select()
                .from(productVariants)
                .where(
                    eq(
                        productVariants.productId,
                        id
                    )
                );

        const images =
            await tx
                .select()
                .from(productImages)
                .where(
                    eq(
                        productImages.productId,
                        id
                    )
                )
                .orderBy(
                    asc(productImages.sortOrder)
                );

        /* =================================================
           BUILD FRONTEND-COMPATIBLE RESPONSE
           ================================================= */

        const colorMap = new Map();
        const sizeSet = new Set();
        const stock = {};

        /*
         * Variants -> colors / sizes / stock
         *
         * IMPORTANT:
         *
         * The frontend expects stock keys like:
         *
         *     black-S
         *     black-M
         *     red-L
         *
         * Therefore the backend MUST generate:
         *
         *     getStockKey(colorSlug, size)
         *
         * and NOT:
         *
         *     getStockKey(size, colorSlug)
         */

        for (const variant of variants) {
            if (variant.size) {
                sizeSet.add(
                    variant.size
                );
            }

            const stockKey =
                getStockKey(
                    variant.colorSlug,
                    variant.size
                );

            stock[stockKey] =
                Number(
                    variant.stockQuantity
                ) || 0;

            if (
                variant.colorSlug &&
                !colorMap.has(
                    variant.colorSlug
                )
            ) {
                colorMap.set(
                    variant.colorSlug,
                    {
                        id:
                            variant.colorSlug,

                        name:
                            variant.colorName ||
                            variant.colorSlug,

                        image:
                            variant.colorImageUrl ||
                            product.collectionImageUrl ||
                            '',

                        images: [],
                    }
                );
            }
        }

        /*
         * Sort images by sortOrder.
         */

        const sortedImages =
            [...images].sort(
                (a, b) =>
                    (a.sortOrder ?? 0) -
                    (b.sortOrder ?? 0)
            );

        /*
         * Attach images to colors.
         */

        for (const image of sortedImages) {
            if (!image.colorSlug) {
                continue;
            }

            const colorSlug =
                image.colorSlug;

            if (
                !colorMap.has(
                    colorSlug
                )
            ) {
                colorMap.set(
                    colorSlug,
                    {
                        id: colorSlug,

                        name:
                            colorSlug
                                .charAt(0)
                                .toUpperCase() +
                            colorSlug.slice(1),

                        image:
                            image.imageUrl,

                        images: [],
                    }
                );
            }

            const color =
                colorMap.get(
                    colorSlug
                );

            if (
                !color.images.includes(
                    image.imageUrl
                )
            ) {
                color.images.push(
                    image.imageUrl
                );
            }
        }

        /*
         * Make sure every color has an image.
         */

        for (
            const color
            of colorMap.values()
        ) {
            if (color.images.length) {
                color.image =
                    color.images[0];
            } else if (color.image) {
                color.images.push(
                    color.image
                );
            }
        }

        /*
         * Primary image.
         */

        const primaryImage =
            sortedImages.find(
                image =>
                    image.isPrimary
            ) ||
            sortedImages[0];

        const allImageUrls =
            sortedImages.map(
                image =>
                    image.imageUrl
            );

        /*
         * IMPORTANT:
         *
         * Preserve the existing frontend
         * response contract.
         */

        return {
            id:
                product.id,

            name:
                product.title,

            slug:
                product.slug,

            description:
                product.description,

            price:
                parseFloat(
                    product.price
                ),

            discount:
                parseFloat(
                    product.discountAmount ||
                    0
                ),

            category:
                product.categorySlug,

            categoryId:
                product.categoryId,

            mainImage:
                primaryImage?.imageUrl ||
                product.collectionImageUrl ||
                '',

            thumbnails:
                allImageUrls.length
                    ? allImageUrls
                    : [
                        product.collectionImageUrl,
                    ].filter(Boolean),

            colors:
                [...colorMap.values()],

            sizes:
                [...sizeSet],

            stock,

            collectionImage:
                product.collectionImageUrl ||
                primaryImage?.imageUrl ||
                '',

            isHidden:
                product.isActive === false,

            is_active:
                Boolean(
                    product.isActive
                ),

            isFeatured:
                Boolean(
                    product.isFeatured
                ),
        };
    },

    /* =====================================================
       PRODUCT BY SLUG
       ===================================================== */

    async findBySlug(
        slug,
        tx = db
    ) {
        if (!slug) {
            return null;
        }

        const [product] =
            await tx
                .select({
                    id: products.id,
                })
                .from(products)
                .where(
                    eq(
                        products.slug,
                        slug
                    )
                );

        if (!product) {
            return null;
        }

        return this.findById(
            product.id,
            tx
        );
    },

    /* =====================================================
       VARIANTS
       ===================================================== */

    async findVariantById(
        variantId,
        tx = db
    ) {
        if (!variantId) {
            return null;
        }

        const [variant] =
            await tx
                .select()
                .from(productVariants)
                .where(
                    eq(
                        productVariants.id,
                        variantId
                    )
                );

        return variant || null;
    },

    async findVariantForOrderItem(
        productId,
        colorId,
        size,
        tx = db
    ) {
        if (!productId || !size) {
            return null;
        }

        const conditions = [
            eq(
                productVariants.productId,
                productId
            ),

            eq(
                productVariants.size,
                size
            ),
        ];

        if (colorId) {
            conditions.push(
                eq(
                    productVariants.colorSlug,
                    colorId
                )
            );
        }

        const [variant] =
            await tx
                .select()
                .from(productVariants)
                .where(
                    and(...conditions)
                );

        return variant || null;
    },

    async lockVariantsForUpdate(
        variantIds,
        tx = db
    ) {
        if (
            !variantIds ||
            variantIds.length === 0
        ) {
            return [];
        }

        return tx
            .select()
            .from(productVariants)
            .where(
                inArray(
                    productVariants.id,
                    variantIds
                )
            )
            .for('update');
    },

    async updateVariantStock(
        variantId,
        stockQuantity,
        tx = db
    ) {
        const [updated] =
            await tx
                .update(productVariants)
                .set({
                    stockQuantity,
                    updatedAt:
                        new Date(),
                })
                .where(
                    eq(
                        productVariants.id,
                        variantId
                    )
                )
                .returning();

        return updated || null;
    },

    /* =====================================================
       PRODUCTS - CREATE
       ===================================================== */

    async createProduct(
        {
            title,
            slug,
            description = '',
            price,
            discountAmount = 0,
            categoryId,
            collectionImageUrl = null,
            isFeatured = false,
            isActive = true,
            variants = [],
            images = [],
        },
        tx = db
    ) {
        const [product] =
            await tx
                .insert(products)
                .values({
                    title,
                    slug,
                    description,
                    price:
                        price.toString(),
                    discountAmount:
                        discountAmount.toString(),
                    categoryId,
                    collectionImageUrl,
                    isFeatured,
                    isActive,
                })
                .returning();

        /*
         * Insert variants.
         */

        for (const variant of variants) {
            await tx
                .insert(productVariants)
                .values({
                    productId:
                        product.id,

                    size:
                        variant.size,

                    colorSlug:
                        variant.colorSlug ||
                        variant.colorId,

                    colorName:
                        variant.colorName ||
                        variant.colorSlug ||
                        variant.colorId,

                    colorImageUrl:
                        variant.colorImageUrl ||
                        null,

                    stockQuantity:
                        variant.stockQuantity ??
                        variant.stock ??
                        0,

                    sku:
                        variant.sku ||
                        `${slug}-${variant.size || 'default'}-${variant.colorSlug || variant.colorId}`
                            .toUpperCase(),
                });
        }

        /*
         * Insert images.
         */

        for (
            let i = 0;
            i < images.length;
            i++
        ) {
            const image =
                images[i];

            await tx
                .insert(productImages)
                .values({
                    productId:
                        product.id,

                    imageUrl:
                        typeof image === 'string'
                            ? image
                            : image.imageUrl,

                    colorSlug:
                        typeof image === 'object'
                            ? image.colorSlug
                            : null,

                    sortOrder:
                        typeof image === 'object' &&
                        image.sortOrder !== undefined
                            ? image.sortOrder
                            : i,

                    isPrimary:
                        typeof image === 'object'
                            ? Boolean(
                                image.isPrimary
                            )
                            : i === 0,
                });
        }

        return this.findById(
            product.id,
            tx
        );
    },

    /* =====================================================
       PRODUCTS - UPDATE
       ===================================================== */

    async updateProduct(
        id,
        payload,
        tx = db
    ) {
        const updateFields = {};

        if (
            payload.title !== undefined
        ) {
            updateFields.title =
                payload.title;
        }

        if (
            payload.slug !== undefined
        ) {
            updateFields.slug =
                payload.slug;
        }

        if (
            payload.description !== undefined
        ) {
            updateFields.description =
                payload.description;
        }

        if (
            payload.price !== undefined
        ) {
            updateFields.price =
                payload.price.toString();
        }

        if (
            payload.discountAmount !== undefined
        ) {
            updateFields.discountAmount =
                payload.discountAmount.toString();
        }

        if (
            payload.categoryId !== undefined
        ) {
            updateFields.categoryId =
                payload.categoryId;
        }

        if (
            payload.collectionImageUrl !== undefined
        ) {
            updateFields.collectionImageUrl =
                payload.collectionImageUrl;
        }

        if (
            payload.isFeatured !== undefined
        ) {
            updateFields.isFeatured =
                payload.isFeatured;
        }

        if (
            payload.isActive !== undefined
        ) {
            updateFields.isActive =
                payload.isActive;
        }

        updateFields.updatedAt =
            new Date();

        if (
            Object.keys(updateFields)
                .length > 0
        ) {
            await tx
                .update(products)
                .set(updateFields)
                .where(
                    eq(
                        products.id,
                        id
                    )
                );
        }

        /*
         * Replace variants if provided.
         */

        if (
            payload.variants &&
            Array.isArray(
                payload.variants
            )
        ) {
            await tx
                .delete(productVariants)
                .where(
                    eq(
                        productVariants.productId,
                        id
                    )
                );

            for (
                const variant
                of payload.variants
            ) {
                await tx
                    .insert(productVariants)
                    .values({
                        productId:
                            id,

                        size:
                            variant.size,

                        colorSlug:
                            variant.colorSlug ||
                            variant.colorId,

                        colorName:
                            variant.colorName ||
                            variant.colorSlug ||
                            variant.colorId,

                        colorImageUrl:
                            variant.colorImageUrl ||
                            null,

                        stockQuantity:
                            variant.stockQuantity ??
                            variant.stock ??
                            0,

                        sku:
                            variant.sku ||
                            `${payload.slug || id}-${variant.size || 'default'}-${variant.colorSlug || variant.colorId}`
                                .toUpperCase(),
                    });
            }
        }

        /*
         * Replace images if provided.
         */

        if (
            payload.images &&
            Array.isArray(
                payload.images
            )
        ) {
            await tx
                .delete(productImages)
                .where(
                    eq(
                        productImages.productId,
                        id
                    )
                );

            for (
                let i = 0;
                i < payload.images.length;
                i++
            ) {
                const image =
                    payload.images[i];

                await tx
                    .insert(productImages)
                    .values({
                        productId:
                            id,

                        imageUrl:
                            typeof image === 'string'
                                ? image
                                : image.imageUrl,

                        colorSlug:
                            typeof image === 'object'
                                ? image.colorSlug
                                : null,

                        sortOrder:
                            typeof image === 'object' &&
                            image.sortOrder !== undefined
                                ? image.sortOrder
                                : i,

                        isPrimary:
                            typeof image === 'object'
                                ? Boolean(
                                    image.isPrimary
                                )
                                : i === 0,
                    });
            }
        }

        return this.findById(
            id,
            tx
        );
    },

    /* =====================================================
       DELETE
       ===================================================== */

    async deleteProduct(
        id,
        tx = db
    ) {
        const [deleted] =
            await tx
                .delete(products)
                .where(
                    eq(
                        products.id,
                        id
                    )
                )
                .returning();

        return deleted || null;
    },
};