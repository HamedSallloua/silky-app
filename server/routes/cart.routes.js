import { Router } from 'express';
import * as cartController from '../controllers/cart.controller.js';
import { optionalAuthMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(optionalAuthMiddleware);

router.get('/', cartController.getCart);
router.post('/items', cartController.addItem);
router.delete('/items/:id', cartController.removeItem);

export default router;
