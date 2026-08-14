import { Router } from 'express';
import * as ordersController from '../controllers/orders.controller.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';

const router = Router();
const admin = [authMiddleware, adminMiddleware];

router.get('/mine', authMiddleware, ordersController.listMine);
router.post('/checkout', optionalAuthMiddleware, ordersController.checkout);
router.get('/', admin, ordersController.list);
router.patch('/bulk-status', admin, ordersController.updateBulkStatus);
router.post('/:id/cancel', admin, ordersController.cancelOrder);
router.patch('/:id/status', admin, ordersController.updateStatus);
router.get('/:id', admin, ordersController.getById);
router.post('/', optionalAuthMiddleware, ordersController.create);

export default router;
