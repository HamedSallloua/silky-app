import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import draftRoutes from './draft.routes.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';
import { adminLoginLimiter, orderMutationLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const admin = [authMiddleware, adminMiddleware];

router.post('/login', adminLoginLimiter, adminController.login);
router.post('/logout', admin, adminController.logout);

router.use('/drafts', draftRoutes);

router.post('/orders/manual', admin, orderMutationLimiter, adminController.createManualOrder);
router.post('/orders/:id/exchange/preview', admin, adminController.previewExchange);
router.post('/orders/:id/exchange', admin, orderMutationLimiter, adminController.createExchange);
router.get('/inventory', admin, adminController.getInventory);
router.patch('/inventory/:variantId', admin, adminController.updateInventory);
router.get('/analytics', admin, adminController.getAnalytics);

export default router;
