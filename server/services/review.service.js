import { reviewRepository } from '../repositories/review.repository.js';
import { AppError } from '../utils/errors.js';

export async function getPublishedStoreReviews() {
  return reviewRepository.getPublishedStoreReviews();
}

export async function getAllStoreReviews() {
  return reviewRepository.getAllStoreReviews();
}

export async function createStoreReview({ authorName, email, body, rating }) {
  if (!authorName?.trim() || !body?.trim()) {
    throw new AppError('Le nom et l\'avis sont requis', 400);
  }
  const ratingNum = parseInt(rating, 10);
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    throw new AppError('La note doit être entre 1 et 5', 400);
  }

  return reviewRepository.createStoreReview({
    authorName: authorName.trim(),
    email: email?.trim() || '',
    body: body.trim(),
    rating: ratingNum,
  });
}

export async function updateStoreReviewStatus(id, status) {
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    throw new AppError('Statut invalide', 400);
  }

  const updated = await reviewRepository.updateStoreReviewStatus(id, status);
  if (!updated) {
    throw new AppError('Avis non trouvé', 404);
  }
  return updated;
}

export async function deleteStoreReview(id) {
  const deleted = await reviewRepository.deleteStoreReview(id);
  if (!deleted) {
    throw new AppError('Avis non trouvé', 404);
  }
  return deleted;
}

export async function getProductReviews(productId) {
  return reviewRepository.getProductReviews(productId);
}

export async function getAllProductReviews(productId) {
  return reviewRepository.getAllProductReviews(productId);
}

export async function createProductReview({ productId, userId, authorName, rating, comment }) {
  if (!comment?.trim()) {
    throw new AppError('Le commentaire est requis', 400);
  }
  const ratingNum = parseInt(rating, 10);
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    throw new AppError('La note doit être entre 1 et 5', 400);
  }

  return reviewRepository.createProductReview({
    productId,
    userId,
    authorName: authorName?.trim() || 'Client',
    rating: ratingNum,
    comment: comment.trim(),
  });
}

export async function updateProductReview(id, { status, showInGeneral }) {
  const updated = await reviewRepository.updateProductReview(id, { status, showInGeneral });
  if (!updated) {
    throw new AppError('Avis non trouvé', 404);
  }
  return updated;
}

export async function deleteProductReview(id) {
  const deleted = await reviewRepository.deleteProductReview(id);
  if (!deleted) {
    throw new AppError('Avis non trouvé', 404);
  }
  return deleted;
}
