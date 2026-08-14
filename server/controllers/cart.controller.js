import * as cartService from '../services/cart.service.js';
import { requireShopper } from '../utils/shopper.js';
import { sendError } from '../utils/errors.js';

export async function getCart(req, res) {
  try {
    const shopper = requireShopper(req);
    const cart = await cartService.getCart(shopper);
    res.json(cart);
  } catch (err) {
    sendError(res, err);
  }
}

export async function addItem(req, res) {
  const { variantId, productId, colorId, size, quantity } = req.body;

  if (!variantId && (!productId || !colorId || !size)) {
    return res.status(400).json({
      error: 'Provide variantId or productId, colorId, and size',
    });
  }

  try {
    const shopper = requireShopper(req);
    const cart = await cartService.addCartItem(shopper, {
      variantId,
      productId,
      colorId,
      size,
      quantity,
    });
    res.status(201).json(cart);
  } catch (err) {
    sendError(res, err);
  }
}

export async function removeItem(req, res) {
  try {
    const shopper = requireShopper(req);
    const cart = await cartService.removeCartItem(shopper, req.params.id);
    res.json(cart);
  } catch (err) {
    sendError(res, err);
  }
}

