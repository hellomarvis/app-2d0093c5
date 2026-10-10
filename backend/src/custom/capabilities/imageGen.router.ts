// PLATFORM-OWNED — the image-generation HTTP surface. Staged together with the
// `imageGen` facade next to it and PROVIDER-AGNOSTIC on purpose: it calls the
// facade, the facade re-exports whichever provider the owner has chosen, and a
// switch rewrites the facade alone. Nothing here, and nothing in the frontend
// button that posts here, ever names a provider.
//
// Authenticated and rate-limited because every generation bills the app owner.
import { Request, Response, Router } from 'express';
import middleware from '../../middleware';
import { generateImage, isConfigured, ImageGenError, PROVIDER_NAME } from './imageGen';

/**
 * A per-user ceiling per hour. Best-effort and in-memory (resets on restart,
 * per instance): it exists to stop a stuck button or a tight loop from running
 * up the owner's bill, not to be a billing control.
 */
const HOURLY_LIMIT_PER_USER = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const recentGenerations = new Map<string, number[]>();

function notConfigured(res: Response) {
  return res.status(503).json({
    error: 'integration_not_configured',
    integration: PROVIDER_NAME,
    message: `${PROVIDER_NAME} API key is not configured.`,
  });
}

function overRateLimit(userId: string): boolean {
  const now = Date.now();
  const hits = (recentGenerations.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= HOURLY_LIMIT_PER_USER) {
    recentGenerations.set(userId, hits);
    return true;
  }
  hits.push(now);
  recentGenerations.set(userId, hits);
  return false;
}

// POST /api/capabilities/image-gen/generate — { prompt, imageUrls?, imageSize?, seed? }
async function generate(req: Request, res: Response): Promise<any> {
  if (!isConfigured()) return notConfigured(res);

  // jwtCheck has already run, so req.user is present (see backend/src/middleware.ts).
  if (overRateLimit(String(req.user!.id))) {
    return res.status(429).json({
      error: 'image_rate_limited',
      message: 'You have generated a lot of images recently — please try again later.',
    });
  }

  const body = (req.body ?? {}) as {
    prompt?: unknown;
    imageUrls?: unknown;
    imageSize?: unknown;
    seed?: unknown;
  };
  try {
    return res.json(
      await generateImage({
        prompt: String(body.prompt ?? ''),
        imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls.map(String) : undefined,
        imageSize: typeof body.imageSize === 'string' ? (body.imageSize as any) : undefined,
        seed: typeof body.seed === 'number' ? body.seed : undefined,
      }),
    );
  } catch (err) {
    if (err instanceof ImageGenError) {
      if (err.status === 503) return notConfigured(res);
      return res.status(err.status).json({ message: err.message });
    }
    console.error('[image-gen] unexpected error:', err);
    return res.status(502).json({ message: 'The image service is unavailable right now.' });
  }
}

const router = Router();
router.post('/generate', middleware.jwtCheck, generate);
export default router;
