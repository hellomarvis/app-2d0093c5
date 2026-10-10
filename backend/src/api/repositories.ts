import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { handlePrismaError } from '../lib/handleError';
import { IntegrationNotConfiguredError, handleSeamError } from '../lib/integrationSeam';

// GET /api/repositories — the signed-in user's own repository analyses
async function listRepositories(req: Request, res: Response): Promise<any> {
  try {
    const repos = await prisma.repositoryAnalysis.findMany({
      where: req.user!.isAdmin ? {} : { userId: req.user!.id },
      orderBy: { requestedAt: 'desc' },
    });
    return res.json(repos);
  } catch (error) {
    return handlePrismaError(error, res);
  }
}

async function loadRepo(req: Request, res: Response): Promise<any | null> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: 'Invalid repository id' });
    return null;
  }
  const repo = await prisma.repositoryAnalysis.findUnique({ where: { id } });
  if (!repo) {
    res.status(404).json({ message: 'Repository not found' });
    return null;
  }
  if (!req.user!.isAdmin && repo.userId !== req.user!.id) {
    res.status(403).json({ message: "You don't have access to this repository." });
    return null;
  }
  return repo;
}

async function getRepository(req: Request, res: Response): Promise<any> {
  const repo = await loadRepo(req, res);
  if (!repo) return;
  return res.json(repo);
}

// @integration-seam text-gen repository-analysis
async function analyzeRepository(req: Request, res: Response): Promise<any> {
  const repo = await loadRepo(req, res);
  if (!repo) return;

  const actor = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!req.user!.isAdmin && actor?.role !== 'developer') {
    return res.status(403).json({ message: 'Only Developer Collaborators can run repository analysis.' });
  }

  // Atomic conditional transition (anything but pending) → pending; 409 if a run is already in flight.
  const claimed = await prisma.repositoryAnalysis.updateMany({
    where: { id: repo.id, status: { not: 'pending' } },
    data: { status: 'pending', requestedByName: actor?.displayName ?? req.user!.email, requestedAt: new Date() },
  });
  if (claimed.count === 0) return res.status(409).json({ message: 'An analysis is already running for this repository.' });

  try {
    throw new IntegrationNotConfiguredError('OpenAI');
  } catch (error) {
    if (error instanceof IntegrationNotConfiguredError) {
      await prisma.repositoryAnalysis.update({
        where: { id: repo.id },
        data: { status: 'failed', errorMessage: error.message },
      });
      if (handleSeamError(error, res)) return;
    }
    return handlePrismaError(error, res);
  }
}

// @integration-seam text-gen repository-question
async function askQuestion(req: Request, res: Response): Promise<any> {
  const repo = await loadRepo(req, res);
  if (!repo) return;
  const { question } = req.body;
  if (typeof question !== 'string' || question.trim().length < 1 || question.length > 500) {
    return res.status(400).json({ message: 'Question must be 1-500 characters' });
  }

  try {
    throw new IntegrationNotConfiguredError('OpenAI');
  } catch (error) {
    if (handleSeamError(error, res)) return;
    return handlePrismaError(error, res);
  }
}

export default { listRepositories, getRepository, analyzeRepository, askQuestion };
