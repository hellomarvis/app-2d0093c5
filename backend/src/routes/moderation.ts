import { Router } from 'express';
import moderationApi from '../api/moderation';
import middleware from '../middleware';

const router = Router();
router.use(middleware.jwtCheck, middleware.requireAdmin);

router.get('/', moderationApi.listActions);

export default router;
