import { Router } from 'express';
import * as favouritesController from '../controllers/favourites.controller.js';
import { optionalAuthMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(optionalAuthMiddleware);

router.get('/', favouritesController.list);
router.post('/toggle', favouritesController.toggle);

export default router;
