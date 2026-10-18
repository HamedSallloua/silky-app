import { Router } from 'express';
import * as governoratesController from '../controllers/governorates.controller.js';

const router = Router();

router.get('/', governoratesController.list);

export default router;
