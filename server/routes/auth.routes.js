import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  authLoginLimiter,
  authRegisterLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
} from '../middleware/rateLimiter.js';

const router = Router();

// Public customer authentication endpoints (rate-limited against brute-force / abuse)
router.post('/register', authRegisterLimiter, authController.register);
router.post('/login', authLoginLimiter, authController.login);
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.post('/reset-password', resetPasswordLimiter, authController.resetPassword);

// Authenticated user endpoints (protected by authMiddleware, unaffected by public limits)
router.get('/me', authMiddleware, authController.me);
router.patch('/me', authMiddleware, authController.updateProfile);
router.post('/change-password', authMiddleware, authController.changePassword);

export default router;
