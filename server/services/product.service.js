import { db } from '../db/orm.js';

import {
    productRepository,
    getStockKey,
} from '../repositories/product.repository.js';

import { AppError } from '../utils/errors.js';

/*
 * ============================================================
 * SLUG
 * ============================================================
 */

function slugify(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/*
 * ============================================================
 * COLOR NORMALIZATION
 * ============================================================
 */

function normalizeColorId(color, index) {
    return (
        color?.id?.toString().trim() ||
        color?.slug?.toString().trim() ||
        slugify(color?.name) ||
        `color-${index}`
    );
}

/*
 * ============================================================
 * STOCK
 * ============================================================
 *
 * Read stock using the same key format produced by the
 * repository:
 *
 *     S::black
 *     M::black
 *     L::black
 *
 * We also keep backwards compatibility with the previous
 * formats.
 */

function getStockQuantity(
    stock,
    size,
    colorSlug
) {
    if (
        !stock ||
        typeof stock !== 'object'
    ) {
        return 0;
    }

    const normalizedSize =
        String(size ?? '').trim();

    const normalizedColor =
        String(colorSlug ?? '').trim();

    const keys = [
        /*
         * CURRENT FORMAT
         */
        getStockKey(
            normalizedSize,
            normalizedColor
        ),

        /*
         * OLD POSSIBLE FORMATS
         */
        `${normalizedColor}::${normalizedSize}`,
        `${normalizedColor}-${normalizedSize}`,
        `${normalizedSize}-${normalizedColor}`,
    ];

    for (const key of keys) {
        if (
            Object.prototype.hasOwnProperty.call(
                stock,
                key
            )
        ) {
            const quantity =
                Number(
                    stock[key]
                );

            return Number.isFinite(quantity)
                ? Math.max(0, quantity)
                : 0;
        }
    }

    return 0;
}

/*
 * ============================================================
 * NORMALIZE FRONTEND PRODUCT
 * ============================================================
 */

function normalizeProductInput(
    payload,
    existingProduct = null
) {
    const merged =
        existingProduct
            ? {
                ...existingProduct,
                ...payload,
            }
            : payload;

    const title =
        merged.name?.trim() ||
        merged.title?.trim();

    if (!title) {
        throw new AppError(
            'Product name is required',
            400
        );
    }

    /*
     * Preserve existing slug.
     */
    const slug =
        merged.slug?.trim() ||
        existingProduct?.slug?.trim() ||
        slugify(title);

    if (!slug) {
        throw new AppError(
            'Product slug is required',
            400
        );
    }

    /*
     * Normalize colors.
     */
    const colors =
        (
            Array.isArray(
                merged.colors
            )
                ? merged.colors
                : []
        )
            .filter(
                color =>
                    color?.name?.trim()
            )
            .map(
                (color, index) => {
                    const id =
                        normalizeColorId(
                            color,
                            index
                        );

                    const name =
                        color.name.trim();

                    let images = [];

                    if (
                        Array.isArray(
                            color.images
                        )
                    ) {
                        images =
                            color.images
                                .map(
                                    image =>
                                        typeof image === 'string'
                                            ? image.trim()
                                            : ''
                                )
                                .filter(Boolean);
                    }

                    if (
                        !images.length &&
                        color.image?.trim()
                    ) {
                        images.push(
                            color.image.trim()
                        );
                    }

                    if (
                        !images.length &&
                        merged.mainImage?.trim()
                    ) {
                        images.push(
                            merged.mainImage.trim()
                        );
                    }

                    return {
                        id,
                        name,
                        image:
                            images[0] || '',
                        images,
                    };
                }
            );

    /*
     * Normalize sizes.
     */
    const sizes =
        (
            Array.isArray(
                merged.sizes
            )
                ? merged.sizes
                : []
        )
            .map(
                size =>
                    String(size).trim()
            )
            .filter(Boolean);

    /*
     * Stock object received from frontend.
     */
    const stock =
        merged.stock &&
        typeof merged.stock === 'object'
            ? merged.stock
            : {};

    /*
     * Main image.
     */
    const mainImage =
        merged.mainImage?.trim() ||
        colors[0]?.image ||
        '';

    const collectionImageUrl =
        merged.collectionImage?.trim() ||
        mainImage ||
        null;

    /*
     * ========================================================
     * BUILD VARIANTS
     * ========================================================
     *
     * Every size/color combination becomes a DB variant.
     */

    const variants = [];

    const targetSizes =
        sizes.length
            ? sizes
            : [''];

    for (const color of colors) {
        for (const size of targetSizes) {
            const stockQuantity =
                getStockQuantity(
                    stock,
                    size,
                    color.id
                );

            variants.push({
                size,

                colorSlug:
                    color.id,

                colorName:
                    color.name,

                colorImageUrl:
                    color.image || null,

                stockQuantity,

                sku:
                    `${slug}-${size || 'default'}-${color.id}`
                        .toUpperCase(),
            });
        }
    }

    /*
     * ========================================================
     * BUILD IMAGES
     * ========================================================
     */

    const images = [];

    const seenImages =
        new Set();

    if (mainImage) {
        images.push({
            imageUrl:
                mainImage,

            colorSlug:
                null,

            sortOrder:
                0,

            isPrimary:
                true,
        });

        seenImages.add(
            `main:${mainImage}`
        );
    }

    let sortOrder =
        images.length;

    /*
     * Thumbnails.
     */
    if (
        Array.isArray(
            merged.thumbnails
        )
    ) {
        for (
            const url
            of merged.thumbnails
        ) {
            if (
                typeof url !== 'string'
            ) {
                continue;
            }

            const imageUrl =
                url.trim();

            if (!imageUrl) {
                continue;
            }

            if (
                imageUrl === mainImage
            ) {
                continue;
            }

            const key =
                `thumbnail:${imageUrl}`;

            if (
                seenImages.has(key)
            ) {
                continue;
            }

            seenImages.add(key);

            images.push({
                imageUrl,

                colorSlug:
                    null,

                sortOrder:
                    sortOrder++,

                isPrimary:
                    false,
            });
        }
    }

    /*
     * Color-specific images.
     */
    for (
        const color
        of colors
    ) {
        for (
            const imageUrl
            of color.images
        ) {
            if (!imageUrl) {
                continue;
            }

            const key =
                `${color.id}:${imageUrl}`;

            if (
                seenImages.has(key)
            ) {
                continue;
            }

            seenImages.add(key);

            images.push({
                imageUrl,

                colorSlug:
                    color.id,

                sortOrder:
                    sortOrder++,

                isPrimary:
                    false,
            });
        }
    }

    return {
        title,

        slug,

        description:
            merged.description?.trim() || '',

        price:
            merged.price === undefined ||
            merged.price === null ||
            merged.price === ''
                ? 0
                : Number(
                    merged.price
                ),

        discountAmount:
            merged.discount === undefined ||
            merged.discount === null ||
            merged.discount === ''
                ? 0
                : Number(
                    merged.discount
                ),

        categorySlug:
            merged.category?.trim() ||
            null,

        categoryId:
            merged.categoryId ||
            null,

        collectionImageUrl,

        isFeatured:
            Boolean(
                merged.isFeatured
            ),

        isActive:
            !Boolean(
                merged.isHidden
            ),

        variants,

        images,
    };
}

/*
 * ============================================================
 * CATEGORY
 * ============================================================
 */

async function resolveCategoryId(
    input,
    tx
) {
    if (input.categoryId) {
        return input.categoryId;
    }

    if (!input.categorySlug) {
        throw new AppError(
            'La catégorie est requise',
            400
        );
    }

    const category =
        await productRepository
            .findCategoryBySlug(
                input.categorySlug,
                tx
            );

    if (!category) {
        throw new AppError(
            'Catégorie non trouvée',
            400
        );
    }

    return category.id;
}

/*
 * ============================================================
 * READ
 * ============================================================
 */

export async function getAllProducts({
    includeHidden = true
} = {}) {
    return productRepository.findAll({
        includeHidden
    });
}

export async function listProducts({
    category,
    search,
    page = 1,
    limit = 24,
    includeHidden = false
} = {}) {
    return productRepository.listPaginated({
        category,
        search,
        page,
        limit,
        includeHidden,
    });
}

export async function getProductById(id) {
    const product =
        await productRepository.findById(
            id
        );

    if (!product) {
        throw new AppError(
            'Produit non trouvé',
            404
        );
    }

    return product;
}

export async function getProductBySlug(slug) {
    const product =
        await productRepository.findBySlug(
            slug
        );

    if (!product) {
        throw new AppError(
            'Produit non trouvé',
            404
        );
    }

    return product;
}

/*
 * ============================================================
 * CREATE
 * ============================================================
 */

export async function createProduct(
    payload
) {
    const input =
        normalizeProductInput(
            payload
        );

    if (
        Number.isNaN(input.price) ||
        input.price < 0
    ) {
        throw new AppError(
            'Le prix doit être positif',
            400
        );
    }

    if (
        Number.isNaN(
            input.discountAmount
        ) ||
        input.discountAmount < 0
    ) {
        throw new AppError(
            'La remise doit être positive',
            400
        );
    }

    return db.transaction(
        async (tx) => {
            const categoryId =
                await resolveCategoryId(
                    input,
                    tx
                );

            const existing =
                await productRepository
                    .findBySlug(
                        input.slug,
                        tx
                    );

            if (existing) {
                throw new AppError(
                    'Un produit avec ce slug existe déjà',
                    409
                );
            }

            return productRepository
                .createProduct(
                    {
                        title:
                            input.title,

                        slug:
                            input.slug,

                        description:
                            input.description,

                        price:
                            input.price,

                        discountAmount:
                            input.discountAmount,

                        categoryId,

                        collectionImageUrl:
                            input.collectionImageUrl,

                        isFeatured:
                            input.isFeatured,

                        isActive:
                            input.isActive,

                        variants:
                            input.variants,

                        images:
                            input.images,
                    },

                    tx
                );
        }
    );
}

/*
 * ============================================================
 * UPDATE
 * ============================================================
 */

export async function updateProduct(
    id,
    payload
) {
    const existing =
        await productRepository.findById(
            id
        );

    if (!existing) {
        throw new AppError(
            'Produit non trouvé',
            404
        );
    }

    const input =
        normalizeProductInput(
            payload,
            existing
        );

    if (
        Number.isNaN(input.price) ||
        input.price < 0
    ) {
        throw new AppError(
            'Le prix doit être positif',
            400
        );
    }

    if (
        Number.isNaN(
            input.discountAmount
        ) ||
        input.discountAmount < 0
    ) {
        throw new AppError(
            'La remise doit être positive',
            400
        );
    }

    return db.transaction(
        async (tx) => {
            const categoryId =
                await resolveCategoryId(
                    input,
                    tx
                );

            if (
                input.slug !==
                existing.slug
            ) {
                const slugCheck =
                    await productRepository
                        .findBySlug(
                            input.slug,
                            tx
                        );

                if (
                    slugCheck &&
                    slugCheck.id !== id
                ) {
                    throw new AppError(
                        'Un produit avec ce slug existe déjà',
                        409
                    );
                }
            }

            return productRepository
                .updateProduct(
                    id,
                    {
                        title:
                            input.title,

                        slug:
                            input.slug,

                        description:
                            input.description,

                        price:
                            input.price,

                        discountAmount:
                            input.discountAmount,

                        categoryId,

                        collectionImageUrl:
                            input.collectionImageUrl,

                        isFeatured:
                            input.isFeatured,

                        isActive:
                            input.isActive,

                        variants:
                            input.variants,

                        images:
                            input.images,
                    },

                    tx
                );
        }
    );
}

/*
 * ============================================================
 * DELETE
 * ============================================================
 */

export async function deleteProduct(
    id
) {
    const existing =
        await productRepository.findById(
            id
        );

    if (!existing) {
        throw new AppError(
            'Produit non trouvé',
            404
        );
    }

    return productRepository.deleteProduct(
        id
    );
}

/*
 * ============================================================
 * ORDERS / VARIANTS
 * ============================================================
 */

export async function findVariantForOrderItem(
    productId,
    colorId,
    size
) {
    return productRepository
        .findVariantForOrderItem(
            productId,
            colorId,
            size
        );
}

/*
 * Keep this export because other backend
 * files may import it.
 */
export {
    getStockKey
};