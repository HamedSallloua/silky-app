import { Router } from 'express';
import * as draftController from '../controllers/draft.controller.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';
import { orderMutationLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const admin = [authMiddleware, adminMiddleware];

router.get('/', admin, draftController.list);
router.post('/', admin, orderMutationLimiter, draftController.create);
router.get('/:id', admin, draftController.getById);
router.patch('/:id', admin, orderMutationLimiter, draftController.save);
router.delete('/:id', admin, orderMutationLimiter, draftController.remove);
router.post('/:id/confirm', admin, orderMutationLimiter, draftController.confirm);

export default router;
