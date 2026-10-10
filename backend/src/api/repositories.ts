import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { handlePrismaError } from '../lib/handleError';
import { generateText, TextGenError } from '../custom/capabilities/textGen';

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
    const result = await generateText({
      system:
        'You are an expert software architect. Analyze the given repository and respond with a JSON object with exactly these keys: codeSummary (string), architectureText (string), dependenciesText (string), potentialIssues (array of strings). Be thorough but concise.',
      messages: [
        {
          role: 'user',
          content: `Analyze this repository:\nOwner: ${repo.repoOwnerName}\nName: ${repo.repoName}\nDescription: ${repo.repoDescription}\nDefault branch: ${repo.defaultBranch}`,
        },
      ],
      maxTokens: 2000,
    });

    let codeSummary = '';
    let architectureText = '';
    let dependenciesText = '';
    let potentialIssues: string[] = [];

    try {
      const parsed = JSON.parse(result.content);
      codeSummary = typeof parsed.codeSummary === 'string' ? parsed.codeSummary : '';
      architectureText = typeof parsed.architectureText === 'string' ? parsed.architectureText : '';
      dependenciesText = typeof parsed.dependenciesText === 'string' ? parsed.dependenciesText : '';
      potentialIssues = Array.isArray(parsed.potentialIssues) ? parsed.potentialIssues : [];
    } catch {
      codeSummary = result.content;
    }

    const updated = await prisma.repositoryAnalysis.update({
      where: { id: repo.id },
      data: {
        status: 'complete',
        codeSummary,
        architectureText,
        dependenciesText,
        potentialIssues,
        completedAt: new Date(),
        errorMessage: null,
      },
    });
    return res.json(updated);
  } catch (error) {
    if (error instanceof TextGenError) {
      await prisma.repositoryAnalysis.update({
        where: { id: repo.id },
        data: { status: 'failed', errorMessage: error.message },
      });
      return res.status(error.status).json({ message: error.message });
    }
    return handlePrismaError(error, res);
  }
}

async function askQuestion(req: Request, res: Response): Promise<any> {
  const repo = await loadRepo(req, res);
  if (!repo) return;
  const { question } = req.body;
  if (typeof question !== 'string' || question.trim().length < 1 || question.length > 500) {
    return res.status(400).json({ message: 'Question must be 1-500 characters' });
  }

  try {
    const context = [
      repo.codeSummary && `Code Summary:\n${repo.codeSummary}`,
      repo.architectureText && `Architecture:\n${repo.architectureText}`,
      repo.dependenciesText && `Dependencies:\n${repo.dependenciesText}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const result = await generateText({
      system: `You are an expert software engineer. Answer questions about the repository ${repo.repoOwnerName}/${repo.repoName}.${context ? `\n\n${context}` : ''}`,
      messages: [{ role: 'user', content: question }],
      maxTokens: 1000,
    });

    const actor = await prisma.user.findUnique({ where: { id: req.user!.id } });
    const repoQuestion = await prisma.repoQuestion.create({
      data: {
        analysisId: repo.id,
        questionText: question,
        answerText: result.content,
        askedByName: actor?.displayName ?? req.user!.email,
      },
    });
    return res.json(repoQuestion);
  } catch (error) {
    if (error instanceof TextGenError) {
      return res.status(error.status).json({ message: error.message });
    }
    return handlePrismaError(error, res);
  }
}

export default { listRepositories, getRepository, analyzeRepository, askQuestion };
