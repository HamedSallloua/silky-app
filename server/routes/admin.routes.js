import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';

const router = Router();
const admin = [authMiddleware, adminMiddleware];

router.post('/login', adminController.login);
router.post('/logout', admin, adminController.logout);

router.post('/orders/manual', admin, adminController.createManualOrder);
router.post('/orders/:id/exchange/preview', admin, adminController.previewExchange);
router.post('/orders/:id/exchange', admin, adminController.createExchange);
router.get('/inventory', admin, adminController.getInventory);
router.patch('/inventory/:variantId', admin, adminController.updateInventory);
router.get('/analytics', admin, adminController.getAnalytics);

export default router;
