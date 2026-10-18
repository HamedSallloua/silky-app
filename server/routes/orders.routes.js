import { Router } from 'express';
import * as ordersController from '../controllers/orders.controller.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';
import {
  checkoutLimiter,
  orderCreationLimiter,
  orderMutationLimiter,
} from '../middleware/rateLimiter.js';

const router = Router();
const admin = [authMiddleware, adminMiddleware];

router.get('/mine', authMiddleware, ordersController.listMine);
router.post('/checkout', checkoutLimiter, optionalAuthMiddleware, ordersController.checkout);
router.get('/', admin, ordersController.list);
router.post('/bulk-confirm', admin, orderMutationLimiter, ordersController.confirmBulkOrders);
router.patch('/bulk-status', admin, orderMutationLimiter, ordersController.updateBulkStatus);
router.post('/:id/confirm', admin, orderMutationLimiter, ordersController.confirmOrder);
router.post('/:id/deliver', admin, orderMutationLimiter, ordersController.deliverOrder);
router.post('/:id/cancel', admin, orderMutationLimiter, ordersController.cancelOrder);
router.post('/:id/refund', admin, orderMutationLimiter, ordersController.refundOrder);
router.patch('/:id/status', admin, orderMutationLimiter, ordersController.updateStatus);
router.get('/:id', admin, ordersController.getById);
router.post('/', orderCreationLimiter, optionalAuthMiddleware, ordersController.create);

export default router;
