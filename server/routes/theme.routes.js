import { Router } from 'express';
import * as themeController from '../controllers/theme.controller.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';
import { upload } from '../utils/upload.js';

const router = Router();
const admin = [authMiddleware, adminMiddleware];

router.get('/', themeController.get);
router.put('/', admin, themeController.update);
router.post('/upload', admin, upload.single('image'), themeController.uploadImage);

export default router;
