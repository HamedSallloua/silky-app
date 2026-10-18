import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';

const router = Router();
const admin = [authMiddleware, adminMiddleware];

router.get('/', admin, notificationController.list);
router.get('/all', admin, notificationController.listAll);
router.patch('/:id/read', admin, notificationController.markRead);
router.post('/read-all', admin, notificationController.markAllRead);

export default router;
