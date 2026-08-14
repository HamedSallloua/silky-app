import { cartRepository } from '../repositories/cart.repository.js';
import { favouriteRepository } from '../repositories/favourite.repository.js';

/**
 * Merges guest cart and favourites into a registered user account.
 * Called after register/login when a guest session exists.
 */
export async function mergeGuestSessionIntoUser(userId, guestSessionId, tx) {
  if (!guestSessionId) return;

  await favouriteRepository.mergeGuestFavouritesIntoUser(userId, guestSessionId, tx);
  await mergeCarts(userId, guestSessionId, tx);
}

async function mergeCarts(userId, guestSessionId, tx) {
  const guestCart = await cartRepository.findCartByGuestSessionId(guestSessionId, tx);
  if (!guestCart) return;

  const userCart = await cartRepository.findCartByUserId(userId, tx);

  if (!userCart) {
    await cartRepository.updateCartUserId(guestCart.id, userId, tx);
    return;
  }

  await cartRepository.mergeGuestItemsIntoUserCart(guestCart.id, userCart.id, tx);
}

