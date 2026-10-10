// PLATFORM-OWNED — the video-generation job lifecycle. Staged together with the
// `videoGen` facade next to it and PROVIDER-AGNOSTIC on purpose: the provider
// contributes two stateless calls (startVideo, checkVideo) through the facade;
// this file owns the job table, the routes and the copy-into-our-storage step.
//
//   POST /generate  → submit, persist an AiVideoJob row, return 202 with the id
//   GET  /jobs/:id  → ask the provider how it's going; on the FIRST completion,
//                     download the bytes, park them in the project's own storage,
//                     flip the row to 'ready'
//   GET  /jobs      → this user's recent generations
//
// THERE IS NO BACKGROUND WORKER, ON PURPOSE. A generated app has no scheduler
// infrastructure, and an in-process setInterval dies with the container. The
// client drives the poll; all state lives in Postgres and at the provider, so a
// restart costs nothing.
//
// THE CLIP IS COPIED, NOT LINKED. Providers expire finished files within days.
import { Request, Response, Router } from 'express';
import { prisma } from '../../lib/prisma';
import middleware from '../../middleware';
import config from '../../../config';
import { startVideo, checkVideo, isConfigured, VideoGenError, PROVIDER, PROVIDER_NAME } from './videoGen';

const ALLOWED_DURATIONS = [4, 6, 8] as const;
const DEFAULT_DURATION = 8;
const ALLOWED_ASPECTS = ['16:9', '9:16'] as const;
const DEFAULT_ASPECT = '16:9';
const MAX_PROMPT_CHARS = 1500;
/** Per-user, per-day cap. Blunt on purpose: one user clicking forty times costs
 *  the owner more than their plan. Raise with VIDEO_DAILY_LIMIT_PER_USER. */
const DAILY_LIMIT_PER_USER = Number(process.env.VIDEO_DAILY_LIMIT_PER_USER ?? 5);

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function notConfigured(res: Response) {
  return res.status(503).json({
    error: 'integration_not_configured',
    integration: PROVIDER_NAME,
    message: `${PROVIDER_NAME} API key is not configured.`,
  });
}

/**
 * Map a provider failure to a user-safe response. Billing gets its OWN code
 * rather than folding into "not configured": they look identical from the
 * outside, but the fix is opposite (paste a key vs enable billing).
 */
function providerError(res: Response, err: unknown) {
  if (err instanceof VideoGenError) {
    if (err.status === 503) return notConfigured(res);
    if (err.status === 402) return res.status(402).json({ error: 'video_billing_required', message: err.message });
    if (err.status === 429) return res.status(429).json({ error: 'video_rate_limited', message: err.message });
    if (err.status === 400 || err.status === 422) return res.status(422).json({ error: 'video_rejected', message: err.message });
  }
  console.error('[video-gen] request failed:', (err as Error)?.message ?? err);
  return res.status(502).json({ error: 'video_upstream_error', message: 'The video service is unavailable right now.' });
}

/** Park the finished clip in the project's own storage; null → keep the provider URL (expires). */
async function persistVideo(bytes: Buffer, jobId: string, contentType: string): Promise<string | null> {
  if (!config.mediaProxyUrl || !config.mediaUploadToken || !config.projectId) {
    console.warn('[video-gen] upload proxy not configured — keeping the provider URL (expires)');
    return null;
  }
  try {
    const resp = await fetch(`${config.mediaProxyUrl}/v1/projects/${config.projectId}/uploads?folder=video`, {
      method: 'POST',
      headers: {
        'x-media-upload-token': config.mediaUploadToken,
        'content-type': 'application/octet-stream',
        'x-content-type': contentType,
        'x-filename': `${jobId}.mp4`,
      },
      body: new Uint8Array(bytes),
    });
    const data: any = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('[video-gen] upload proxy rejected the clip:', data?.error ?? resp.status);
      return null;
    }
    return String(data?.url ?? '') || null;
  } catch (err) {
    console.error('[video-gen] upload proxy unreachable:', (err as Error).message);
    return null;
  }
}

function normalizeOptions(body: Record<string, unknown>) {
  const durationSecs = ALLOWED_DURATIONS.includes(Number(body.durationSecs) as any) ? Number(body.durationSecs) : DEFAULT_DURATION;
  const aspectRatio = ALLOWED_ASPECTS.includes(String(body.aspectRatio) as any) ? (String(body.aspectRatio) as '16:9' | '9:16') : DEFAULT_ASPECT;
  const imageUrl = String(body.imageUrl ?? '').trim() || undefined;
  return { durationSecs: durationSecs as 4 | 6 | 8, aspectRatio, imageUrl };
}

/**
 * Submit a clip and record the job. The shared core of the route and of
 * `startVideoJob`. Throws VideoGenError.
 */
async function submit(
  userId: number,
  prompt: string,
  opts: { imageUrl?: string; durationSecs: 4 | 6 | 8; aspectRatio: '16:9' | '9:16' },
): Promise<{ id: string }> {
  const started = await startVideo({ prompt, imageUrl: opts.imageUrl, durationSecs: opts.durationSecs, aspectRatio: opts.aspectRatio });
  const job = await prisma.aiVideoJob.create({
    data: {
      userId,
      prompt,
      provider: PROVIDER,
      operationId: started.operationId,
      status: 'pending',
      durationSecs: opts.durationSecs,
      aspectRatio: opts.aspectRatio,
      model: started.model,
    },
  });
  return { id: job.id };
}

/**
 * Server-side generation for a PRD-defined automatic flow (a scheduler, a
 * post-publish hook). Returns the job id; the UI polls it like any other.
 * Bypasses the per-user daily cap — an owner-defined automation is not a user
 * hammering a button — but still refuses without a key. Never throws.
 */
export async function startVideoJob(
  userId: number,
  prompt: string,
  opts?: { imageUrl?: string; durationSecs?: number; aspectRatio?: string },
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!isConfigured()) return { ok: false, message: `${PROVIDER_NAME} API key is not configured.` };
  const text = String(prompt ?? '').trim().slice(0, MAX_PROMPT_CHARS);
  if (!text) return { ok: false, message: 'prompt is required' };
  try {
    const { id } = await submit(userId, text, normalizeOptions(opts ?? {}));
    return { ok: true, id };
  } catch (err) {
    console.error('[video-gen] server-side generation failed:', (err as Error).message);
    return { ok: false, message: err instanceof VideoGenError ? err.message : 'Could not start video generation.' };
  }
}

// POST /api/capabilities/video-gen/generate — { prompt, imageUrl?, durationSecs?, aspectRatio? }
async function generate(req: Request, res: Response): Promise<any> {
  if (!isConfigured()) return notConfigured(res);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const prompt = String(body.prompt ?? '').trim();
  if (!prompt) return res.status(400).json({ message: 'prompt is required' });
  if (prompt.length > MAX_PROMPT_CHARS) return res.status(400).json({ message: `prompt must be ${MAX_PROMPT_CHARS} characters or fewer` });

  const userId = req.user!.id;
  // Cost guard, BEFORE submitting: once the provider accepts, the money is spent.
  const usedToday = await prisma.aiVideoJob.count({ where: { userId, createdAt: { gte: startOfToday() } } });
  if (usedToday >= DAILY_LIMIT_PER_USER) {
    return res.status(429).json({
      error: 'video_daily_limit',
      message: `You've reached today's limit of ${DAILY_LIMIT_PER_USER} videos. Try again tomorrow.`,
    });
  }
  try {
    const { id } = await submit(userId, prompt, normalizeOptions(body));
    // 202: accepted, not done. The client polls /jobs/:id from here.
    return res.status(202).json({ id, status: 'pending', estimatedSeconds: 120 });
  } catch (err) {
    return providerError(res, err);
  }
}

async function fail(id: string, message: string) {
  return prisma.aiVideoJob.update({ where: { id }, data: { status: 'failed', errorMessage: message } });
}

/** Never expose operationId or provider — plumbing, not app data. */
function serialize(job: any) {
  return {
    id: job.id,
    status: job.status,
    prompt: job.prompt,
    videoUrl: job.videoUrl,
    durationSecs: job.durationSecs,
    aspectRatio: job.aspectRatio,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
  };
}

/**
 * GET /jobs/:id — status, and the place completion actually happens.
 * Idempotent: a row already 'ready' or 'failed' short-circuits, so two tabs
 * polling the same job cannot download or upload twice.
 */
async function jobStatus(req: Request, res: Response): Promise<any> {
  const job = await prisma.aiVideoJob.findUnique({ where: { id: String(req.params.id) } });
  if (!job || job.userId !== req.user!.id) return res.status(404).json({ message: 'Video not found' });
  if (job.status !== 'pending') return res.json(serialize(job));
  if (!isConfigured()) return notConfigured(res);
  if (!job.operationId) return res.json(serialize(await fail(job.id, 'This video was never submitted successfully.')));
  if (job.provider && job.provider !== PROVIDER) {
    // Submitted to a provider the owner has since switched away from; the new
    // provider cannot report on it.
    return res.json(serialize(await fail(job.id, 'The video provider was changed before this clip finished.')));
  }

  try {
    const result = await checkVideo({ operationId: job.operationId, model: job.model });
    if (result.status === 'pending') return res.json(serialize(job));
    if (result.status === 'failed') return res.json(serialize(await fail(job.id, result.message)));

    // Bytes from the provider, or a URL to fetch them from — either way copy
    // them into our own storage before the provider's copy expires.
    let bytes: Buffer | null = result.video;
    if (!bytes && result.videoUrl) {
      try {
        const resp = await fetch(result.videoUrl);
        if (resp.ok) bytes = Buffer.from(await resp.arrayBuffer());
      } catch (err) {
        console.error('[video-gen] could not download the finished clip:', (err as Error).message);
      }
    }
    if (!bytes && !result.videoUrl) return res.json(serialize(await fail(job.id, 'The finished video could not be retrieved.')));

    const storedUrl = bytes ? await persistVideo(bytes, job.id, result.contentType || 'video/mp4') : null;
    const ready = await prisma.aiVideoJob.update({
      where: { id: job.id },
      data: {
        status: 'ready',
        videoUrl: storedUrl ?? result.videoUrl ?? '',
        errorMessage: storedUrl ? null : 'Stored temporarily — this clip expires soon.',
      },
    });
    return res.json(serialize(ready));
  } catch (err) {
    return providerError(res, err);
  }
}

// GET /jobs — this user's recent generations, newest first.
async function listJobs(req: Request, res: Response): Promise<any> {
  const jobs = await prisma.aiVideoJob.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 20 });
  return res.json({ jobs: jobs.map(serialize) });
}

const router = Router();
// Authenticated: every clip costs the owner real money.
router.post('/generate', middleware.jwtCheck, generate);
router.get('/jobs/:id', middleware.jwtCheck, jobStatus);
router.get('/jobs', middleware.jwtCheck, listJobs);
export default router;
