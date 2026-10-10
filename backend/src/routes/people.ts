import { Router } from 'express';
import peopleApi from '../api/people';
import middleware from '../middleware';

const router = Router();
router.use(middleware.jwtCheck);
router.get('/', peopleApi.listPeople);

export default router;
