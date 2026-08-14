import { Router } from 'express';
import * as reviewsController from '../controllers/reviews.controller.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';

const router = Router();
const admin = [authMiddleware, adminMiddleware];

router.get('/published', reviewsController.listPublished);
router.post('/', optionalAuthMiddleware, reviewsController.submit);
router.get('/', admin, reviewsController.listAll);
router.patch('/:id', admin, reviewsController.updateStatus);
router.delete('/:id', admin, reviewsController.remove);

export default router;
