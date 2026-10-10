import { Router } from 'express';
import assistantApi from '../api/assistant';
import middleware from '../middleware';

const router = Router();
router.use(middleware.jwtCheck);

router.get('/questions', assistantApi.listQuestions);
router.post('/questions', assistantApi.askQuestion);

export default router;
