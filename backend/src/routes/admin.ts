import { Router } from 'express';
import adminApi from '../api/admin';
import middleware from '../middleware';

const router = Router();

// All admin routes require a valid JWT carrying isAdmin=true.
router.get('/users', middleware.jwtCheck, middleware.requireAdmin, adminApi.listUsers);
router.put('/users/:id/role', middleware.jwtCheck, middleware.requireAdmin, adminApi.changeRole);
router.post('/users/:id/suspend', middleware.jwtCheck, middleware.requireAdmin, adminApi.suspendUser);
router.post('/users/:id/restore', middleware.jwtCheck, middleware.requireAdmin, adminApi.restoreUser);

export default router;
