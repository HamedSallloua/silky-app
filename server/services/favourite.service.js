import { favouriteRepository } from '../repositories/favourite.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import { AppError } from '../utils/errors.js';

export async function getFavourites(shopper) {
  const favouritesList = await favouriteRepository.findByShopper(shopper);
  const productIds = favouritesList.map((f) => f.productId);
  return {
    productIds,
    favourites: favouritesList,
  };
}

export async function toggleFavourite(shopper, productId) {
  if (!productId) {
    throw new AppError('productId is required', 400);
  }

  const product = await productRepository.findById(productId);
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const exists = await favouriteRepository.exists(shopper, productId);
  let favorited = false;

  if (exists) {
    await favouriteRepository.remove(shopper, productId);
    favorited = false;
  } else {
    await favouriteRepository.add(shopper, productId);
    favorited = true;
  }

  const favouritesList = await favouriteRepository.findByShopper(shopper);
  const productIds = favouritesList.map((f) => f.productId);
  return {
    isFavourite: favorited,
    favorited,
    productIds,
    favourites: favouritesList,
  };
}
