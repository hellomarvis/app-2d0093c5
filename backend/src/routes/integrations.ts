import { Router } from 'express';
import integrationsApi from '../api/integrations';
import middleware from '../middleware';

const router = Router();
router.use(middleware.jwtCheck);

router.get('/', integrationsApi.listIntegrations);
router.post('/:id/connect', integrationsApi.connectIntegration);
router.put('/:id/toggle', middleware.requireAdmin, integrationsApi.toggleIntegration);

export default router;
