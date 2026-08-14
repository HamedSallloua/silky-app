import { productRepository } from '../repositories/product.repository.js';
import { AppError } from '../utils/errors.js';

export async function getAllProducts({ includeHidden = true } = {}) {
  return productRepository.findAll({ includeHidden });
}

export async function listProducts({ category, search, page = 1, limit = 24, includeHidden = false } = {}) {
  return productRepository.listPaginated({ category, search, page, limit, includeHidden });
}

export async function getProductById(id) {
  const product = await productRepository.findById(id);
  if (!product) {
    throw new AppError('Produit non trouvé', 404);
  }
  return product;
}

export async function getProductBySlug(slug) {
  const product = await productRepository.findBySlug(slug);
  if (!product) {
    throw new AppError('Produit non trouvé', 404);
  }
  return product;
}

export async function createProduct(payload) {
  if (!payload.title?.trim() || !payload.slug?.trim() || !payload.categoryId) {
    throw new AppError('Titre, slug et catégorie sont requis', 400);
  }
  if (payload.price === undefined || payload.price < 0) {
    throw new AppError('Le prix doit être positif', 400);
  }

  const existing = await productRepository.findBySlug(payload.slug);
  if (existing) {
    throw new AppError('Un produit avec ce slug existe déjà', 409);
  }

  return productRepository.createProduct(payload);
}

export async function updateProduct(id, payload) {
  const existing = await productRepository.findById(id);
  if (!existing) {
    throw new AppError('Produit non trouvé', 404);
  }

  if (payload.slug && payload.slug !== existing.slug) {
    const slugCheck = await productRepository.findBySlug(payload.slug);
    if (slugCheck) {
      throw new AppError('Un produit avec ce slug existe déjà', 409);
    }
  }

  return productRepository.updateProduct(id, payload);
}

export async function deleteProduct(id) {
  const existing = await productRepository.findById(id);
  if (!existing) {
    throw new AppError('Produit non trouvé', 404);
  }

  return productRepository.deleteProduct(id);
}

export async function findVariantForOrderItem(productId, colorId, size) {
  return productRepository.findVariantForOrderItem(productId, colorId, size);
}
