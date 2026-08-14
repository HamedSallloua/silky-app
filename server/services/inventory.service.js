import { productRepository } from '../repositories/product.repository.js';
import { AppError } from '../utils/errors.js';

const LOW_STOCK_THRESHOLD = 5;

export async function getInventory() {
  const products = await productRepository.findAll({ includeHidden: true });
  const result = [];

  for (const p of products) {
    for (const v of (p.variants || [])) {
      const stockQuantity = v.stockQuantity;
      result.push({
        variantId: v.id,
        productId: p.id,
        productTitle: p.title,
        productIsHidden: p.isActive === false,
        size: v.size,
        colorSlug: v.colorSlug,
        colorName: v.colorName,
        sku: v.sku,
        stockQuantity: stockQuantity,
        colorImageUrl: v.colorImageUrl,
        lowStock: stockQuantity <= LOW_STOCK_THRESHOLD,
      });
    }
  }

  result.sort((a, b) => {
    if (a.lowStock !== b.lowStock) return a.lowStock ? -1 : 1;
    if (a.productTitle !== b.productTitle) return a.productTitle.localeCompare(b.productTitle);
    if (a.colorName !== b.colorName) return a.colorName.localeCompare(b.colorName);
    return a.size.localeCompare(b.size);
  });

  return result;
}

export async function updateVariantStock(variantId, stockQuantity) {
  const quantity = parseInt(stockQuantity, 10);
  if (isNaN(quantity) || quantity < 0) {
    throw new AppError('La quantité de stock doit être un nombre positif', 400);
  }

  const variant = await productRepository.findVariantById(variantId);
  if (!variant) {
    throw new AppError('Variant non trouvé', 404);
  }

  const updated = await productRepository.updateVariantStock(variantId, quantity);
  const product = await productRepository.findById(variant.productId);

  return {
    variantId: updated.id,
    productId: product.id,
    productTitle: product.title,
    size: updated.size,
    colorSlug: updated.colorSlug,
    colorName: updated.colorName,
    sku: updated.sku,
    stockQuantity: updated.stockQuantity,
    colorImageUrl: updated.colorImageUrl,
    lowStock: updated.stockQuantity <= LOW_STOCK_THRESHOLD,
  };
}
