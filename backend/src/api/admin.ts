import { Request, Response } from 'express';
import User from '../models/user';
import { handlePrismaError } from '../lib/handleError';
import { prisma } from '../lib/prisma';

// List all users in the actor's tenant. Mounted behind jwtCheck + requireAdmin.
async function listUsers(req: Request, res: Response): Promise<any> {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const users = await User.listByTenant(req.user.tenantId);
    return res.status(200).json(users);
  } catch (error) {
    console.error('Error listing users:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

const VALID_ROLES = ['admin', 'professional', 'developer'];

// PATCH /api/admin/users/:id/role { role }
async function changeRole(req: Request, res: Response): Promise<any> {
  const id = Number(req.params.id);
  const { role } = req.body;
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid user id' });
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ message: 'Invalid role' });
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  if (id === req.user.id && role !== 'admin') {
    return res.status(403).json({ message: 'Admins cannot demote themselves' });
  }

  try {
    const target = await User.getUserById(id);
    if (!target || target.tenantId !== req.user.tenantId) return res.status(404).json({ message: 'User not found' });
    const updated = await User.updateRole(id, role as 'admin' | 'professional' | 'developer');
    await prisma.moderationAction.create({
      data: {
        tenantId: req.user.tenantId,
        actionType: 'role_changed',
        targetLabel: updated.email,
        reason: `Role changed to ${role}`,
        actedById: req.user.id,
        actedByName: req.user.email,
      },
    });
    const { password: _p, passwordResetTokenHash: _h, passwordResetExpiresAt: _e, ...safe } = updated;
    return res.status(200).json(safe);
  } catch (error) {
    return handlePrismaError(error, res);
  }
}

// POST /api/admin/users/:id/suspend
async function suspendUser(req: Request, res: Response): Promise<any> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid user id' });
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  if (id === req.user.id) return res.status(403).json({ message: 'Admins cannot suspend themselves' });

  try {
    const target = await User.getUserById(id);
    if (!target || target.tenantId !== req.user.tenantId) return res.status(404).json({ message: 'User not found' });
    const updated = await User.updateStatus(id, 'suspended');
    await prisma.moderationAction.create({
      data: {
        tenantId: req.user.tenantId,
        actionType: 'user_suspended',
        targetLabel: updated.email,
        reason: 'Suspended by admin',
        actedById: req.user.id,
        actedByName: req.user.email,
      },
    });
    const { password: _p, passwordResetTokenHash: _h, passwordResetExpiresAt: _e, ...safe } = updated;
    return res.status(200).json(safe);
  } catch (error) {
    return handlePrismaError(error, res);
  }
}

// POST /api/admin/users/:id/restore
async function restoreUser(req: Request, res: Response): Promise<any> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid user id' });
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const target = await User.getUserById(id);
    if (!target || target.tenantId !== req.user.tenantId) return res.status(404).json({ message: 'User not found' });
    const updated = await User.updateStatus(id, 'active');
    await prisma.moderationAction.create({
      data: {
        tenantId: req.user.tenantId,
        actionType: 'user_restored',
        targetLabel: updated.email,
        reason: 'Restored by admin',
        actedById: req.user.id,
        actedByName: req.user.email,
      },
    });
    const { password: _p, passwordResetTokenHash: _h, passwordResetExpiresAt: _e, ...safe } = updated;
    return res.status(200).json(safe);
  } catch (error) {
    return handlePrismaError(error, res);
  }
}

export default { listUsers, changeRole, suspendUser, restoreUser };
