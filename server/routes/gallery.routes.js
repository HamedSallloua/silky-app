import { Router } from 'express';
import * as galleryController from '../controllers/gallery.controller.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';
import { upload } from '../utils/upload.js';

const router = Router();
const admin = [authMiddleware, adminMiddleware];

router.get('/', admin, galleryController.list);
router.post('/', admin, upload.single('image'), galleryController.add);
router.delete('/:id', admin, galleryController.remove);

export default router;
