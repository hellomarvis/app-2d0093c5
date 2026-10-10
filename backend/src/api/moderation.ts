import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { handlePrismaError } from '../lib/handleError';

// GET /api/moderation — admin-only audit log of moderation actions
async function listActions(req: Request, res: Response): Promise<any> {
  try {
    const actions = await prisma.moderationAction.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { actedAt: 'desc' },
      take: 100,
    });
    return res.json(actions);
  } catch (error) {
    return handlePrismaError(error, res);
  }
}

export default { listActions };
