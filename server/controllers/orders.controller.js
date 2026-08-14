import * as orderService from '../services/order.service.js';
import { requireShopper } from '../utils/shopper.js';
import { sendError } from '../utils/errors.js';

export async function listMine(req, res) {
  try {
    const orders = await orderService.getOrdersByUserId(req.user.id);
    res.json(orders);
  } catch (err) {
    sendError(res, err);
  }
}

export async function list(_req, res) {
  try {
    const orders = await orderService.getAllOrders();
    res.json(orders);
  } catch (err) {
    sendError(res, err);
  }
}

export async function getById(req, res) {
  try {
    const order = await orderService.getOrderById(req.params.id);
    res.json(order);
  } catch (err) {
    sendError(res, err);
  }
}

export async function create(req, res) {
  if (req.user?.role === 'admin') {
    return res.status(403).json({ error: 'Les administrateurs ne peuvent pas passer de commandes.' });
  }

  const { customer, items } = req.body;
  if (!items?.length) {
    return res.status(400).json({ error: 'Items are required' });
  }

  try {
    const order = await orderService.createOrder({
      customer,
      items,
      userId: req.user?.id || null,
    });
    res.status(201).json(order);
  } catch (err) {
    sendError(res, err);
  }
}

export async function checkout(req, res) {
  if (req.user?.role === 'admin') {
    return res.status(403).json({ error: 'Les administrateurs ne peuvent pas passer de commandes.' });
  }

  const customer = req.body.customer || req.body;
  if (!customer) {
    return res.status(400).json({ error: 'Customer delivery info is required' });
  }

  try {
    const shopper = requireShopper(req);
    const order = await orderService.checkoutFromCart({ customer, shopper });
    res.status(201).json(order);
  } catch (err) {
    sendError(res, err);
  }
}

export async function cancelOrder(req, res) {
  try {
    const order = await orderService.cancelOrder(req.params.id);
    res.json(order);
  } catch (err) {
    sendError(res, err);
  }
}

export async function updateStatus(req, res) {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status parameter is required' });
  }

  try {
    const order = await orderService.updateOrderStatus(req.params.id, status);
    res.json(order);
  } catch (err) {
    sendError(res, err);
  }
}

export async function updateBulkStatus(req, res) {
  const { orderIds, status } = req.body;
  if (!Array.isArray(orderIds) || !status) {
    return res.status(400).json({ error: 'orderIds array and status parameter are required' });
  }

  try {
    const updatedList = [];
    for (const id of orderIds) {
      const updated = await orderService.updateOrderStatus(id, status);
      if (updated) updatedList.push(updated);
    }
    res.json(updatedList);
  } catch (err) {
    sendError(res, err);
  }
}