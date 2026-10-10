import { Router } from 'express';
import repositoriesApi from '../api/repositories';
import middleware from '../middleware';

const router = Router();
router.use(middleware.jwtCheck);

router.get('/', repositoriesApi.listRepositories);
router.get('/:id', repositoriesApi.getRepository);
router.post('/:id/analyze', repositoriesApi.analyzeRepository);
router.post('/:id/questions', repositoriesApi.askQuestion);

export default router;
