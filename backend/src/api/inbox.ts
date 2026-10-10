import { Request, Response } from 'express';

// GET /api/inbox — unified Gmail + Slack threads. Honest empty state: this
// workspace has no persisted mailbox/thread store (out of scope — only
// threads started in NexusAI would appear, and sending one requires the
// Gmail/Slack seam below, which is not configured yet), so there are never
// any threads until those integrations are connected.
async function listThreads(_req: Request, res: Response): Promise<any> {
  return res.json([]);
}

export default { listThreads };
