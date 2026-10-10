import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { handlePrismaError } from '../lib/handleError';
import { IntegrationNotConfiguredError, handleSeamError } from '../lib/integrationSeam';

// GET /api/integrations — visible to every signed-in member (read-only)
async function listIntegrations(req: Request, res: Response): Promise<any> {
  try {
    const rows = await prisma.integrationSetting.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { serviceName: 'asc' },
    });
    return res.json(rows);
  } catch (error) {
    return handlePrismaError(error, res);
  }
}

// PATCH /api/integrations/:id/toggle — admin only
async function toggleIntegration(req: Request, res: Response): Promise<any> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid integration id' });

  try {
    const row = await prisma.integrationSetting.findFirst({ where: { id, tenantId: req.user!.tenantId } });
    if (!row) return res.status(404).json({ message: 'Integration not found' });
    const updated = await prisma.integrationSetting.update({
      where: { id },
      data: { isEnabled: !row.isEnabled, updatedByName: req.user!.email },
    });
    return res.json(updated);
  } catch (error) {
    return handlePrismaError(error, res);
  }
}

// @integration-seam gmail connect-account
// @integration-seam slack connect-account
// @integration-seam google-drive connect-account
// @integration-seam google-docs connect-account
// @integration-seam google-sheets connect-account
// @integration-seam github connect-account
// @integration-seam instagram connect-account
// @integration-seam facebook connect-account
// A member connecting their own service account — every one of these is a
// real third-party OAuth connection with no credential store on this
// platform, so each stops at an honest seam until the owner wires the kit.
async function connectIntegration(req: Request, res: Response): Promise<any> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid integration id' });
  const row = await prisma.integrationSetting.findFirst({ where: { id, tenantId: req.user!.tenantId } });
  if (!row) return res.status(404).json({ message: 'Integration not found' });
  if (!row.isEnabled) return res.status(403).json({ message: 'This integration is turned off for the workspace.' });

  try {
    throw new IntegrationNotConfiguredError(row.serviceName);
  } catch (error) {
    if (handleSeamError(error, res)) return;
    return handlePrismaError(error, res);
  }
}

export default { listIntegrations, toggleIntegration, connectIntegration };
