import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { handlePrismaError } from '../lib/handleError';
import { generateText, TextGenError } from '../custom/capabilities/textGen';

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

async function askQuestion(req: Request, res: Response): Promise<any> {
  const { question } = req.body;
  if (typeof question !== 'string' || question.trim().length < 1 || question.length > 500) {
    return res.status(400).json({ message: 'Question must be 1-500 characters' });
  }

  try {
    const result = await generateText({
      system: 'You are a helpful AI assistant. Answer the user\'s question clearly and concisely.',
      messages: [{ role: 'user', content: question }],
      maxTokens: 1000,
    });

    const record = await prisma.assistantQuestion.create({
      data: {
        userId: req.user!.id,
        questionText: question,
        answerText: result.content,
        sourcesUsed: [],
      },
    });
    return res.json(record);
  } catch (error) {
    if (error instanceof TextGenError) {
      return res.status(error.status).json({ message: error.message });
    }
    return handlePrismaError(error, res);
  }
}

export default { listQuestions, askQuestion };
