import { Router } from 'express';
import inboxApi from '../api/inbox';
import middleware from '../middleware';

const router = Router();
router.use(middleware.jwtCheck);
router.get('/', inboxApi.listThreads);

export default router;
