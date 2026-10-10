import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { handlePrismaError } from '../lib/handleError';

// GET /api/people — the member directory. Suspended members are not listed.
async function listPeople(req: Request, res: Response): Promise<any> {
  try {
    const people = await prisma.user.findMany({
      where: { tenantId: req.user!.tenantId, status: 'active', id: { not: req.user!.id } },
      select: { id: true, displayName: true, role: true, status: true, createdAt: true },
      orderBy: { displayName: 'asc' },
    });
    return res.json(people);
  } catch (error) {
    return handlePrismaError(error, res);
  }
}

export default { listPeople };
