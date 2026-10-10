import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { handlePrismaError } from '../lib/handleError';
import { IntegrationNotConfiguredError, handleSeamError } from '../lib/integrationSeam';

// GET /api/assistant/questions — the signed-in user's own past questions only
async function listQuestions(req: Request, res: Response): Promise<any> {
  try {
    const questions = await prisma.assistantQuestion.findMany({
      where: { userId: req.user!.id },
      orderBy: { askedAt: 'desc' },
    });
    return res.json(questions);
  } catch (error) {
    return handlePrismaError(error, res);
  }
}

// @integration-seam text-gen assistant-answer
async function askQuestion(req: Request, res: Response): Promise<any> {
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

export default { listQuestions, askQuestion };
