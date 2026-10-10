// INTEGRATION KIT — fal.ai (text-to-image generation).
//
// Staged verbatim when the project owner supplies FAL_KEY. REPLACES the
// not-configured stub the first build left here.
//
// ─── WHY THIS IS SYNCHRONOUS AND THE VEO KIT IS NOT ────────────────────────
//
// fal's queue API is asynchronous — submit, poll, collect — but a flux/schnell
// image lands in a couple of seconds, not the minutes a Veo clip takes. So the
// polling loop lives INSIDE `generateImage()` and the helper presents a plain
// awaited call: `generateImage({ prompt }) -> { url }`. That is the shape every
// seam in this platform binds to (the same shape as `chatCompletion` and
// `synthesizeSpeech`), and it means this kit needs no job table, no polling
// route, and no schema of its own. Do not "upgrade" it to a job model: a table
// whose rows are always written and read within one request is pure overhead.
//
// The queue is still what we submit to rather than the direct `fal.run` host,
// because the queue gives request durability and automatic retries upstream.
//
// ─── TWO SHAPES: FROM NOTHING, AND FROM THE USER'S OWN PICTURES ────────────
//
// `generateImage({ prompt })` paints from the prompt alone. `generateImage({
// prompt, imageUrls })` paints FROM THE PICTURES THE USER GAVE YOU — the
// person and the garment for a try-on, the room to restyle, the product to
// drop into a scene. The two are different fal endpoints, not a flag on one,
// and picking between them is the ONLY thing `imageUrls` does.
//
// This distinction is load-bearing. A try-on feature that calls the prompt-only
// shape does not degrade — it returns a photorealistic picture of a STRANGER in
// a garment that is not the one uploaded, bills the owner for it, and looks
// entirely successful to every layer above. So the rule is: if the output is
// meant to contain something the user supplied, that something goes in
// `imageUrls`. Never describe an uploaded photo in words and hope.
//
// ─── WHY WE COPY THE BYTES ─────────────────────────────────────────────────
//
// fal serves the finished image from its own CDN and deletes it after about 7
// days. Storing that URL on a record gives the app a picture that silently
// disappears the following week. So on success we download the image once and
// push it through the platform's upload proxy (the same one /api/uploads uses)
// and return OUR url. Falling back to fal's URL is a DEGRADED path taken only
// when the project has no storage configured — never the normal one.
//
// ─── WHY THE COST GUARDS ARE NOT OPTIONAL ──────────────────────────────────
//
// fal bills per megapixel against the owner's own account and has no free tier.
// Hence: authenticated routes only, `num_images` pinned to 1, a model allowlist
// a client cannot escape, and a per-user rate limit. A client can only ask for
// less than the defaults, never more.
import { Request, Response, Router } from 'express';
import middleware from '../../middleware';
import config from '../../../config';
// Owner-actionable provider errors are reported to the platform dashboard.
import { errorFieldsFromBody, reportIntegrationError } from './integrationSignal';

// ─── tuning ────────────────────────────────────────────────────────────────

const QUEUE_BASE = 'https://queue.fal.run';

/**
 * The model allowlist, and the reason there is one.
 *
 * fal routes by endpoint id, so an unvalidated `model` in a request body is a
 * client-controlled URL segment that also picks the price. Every tier that may
 * be reached is named here, with its cost understood.
 *
 * WHY THE DEFAULT IS `best` AND NOT THE CHEAPEST. Nano Banana Pro (Google's
 * Gemini 3 Pro Image) reasons about composition and lighting before it renders,
 * and it is the only model in this list that puts LEGIBLE, correctly-spelled
 * text inside the picture — FLUX garbles words. It also holds a subject
 * consistent between generations. It costs roughly fifty times a `flux/schnell`
 * image, and that trade was made deliberately: these apps generate a handful of
 * images a person actually looks at, not a bulk pipeline.
 *
 * The cheaper FLUX tiers stay reachable and stay working — `tier: 'fast'` is
 * still schnell — so anything already asking for them behaves exactly as before.
 *
 * `family` is what decides the request shape. The two families do NOT share an
 * input schema (see buildInput): FLUX takes `image_size` + `enable_safety_checker`,
 * Nano Banana takes `aspect_ratio` + `safety_tolerance`. Adding a model without
 * naming its family correctly sends FLUX's parameters to an endpoint that will
 * reject them.
 */
type ModelFamily = 'flux' | 'nano-banana';

const MODELS = {
  /** Gemini 3 Pro Image. Best quality, best text rendering. ~$0.15/image. */
  best: { id: 'fal-ai/nano-banana-pro', family: 'nano-banana' },
  /** FLUX.1 schnell — distilled, 1-3s, cheapest by a wide margin. */
  fast: { id: 'fal-ai/flux/schnell', family: 'flux' },
  /** FLUX.1 dev — the FLUX quality step up. */
  quality: { id: 'fal-ai/flux/dev', family: 'flux' },
} as const;
export type ModelTier = keyof typeof MODELS;
const DEFAULT_TIER: ModelTier = 'best';

/**
 * The reference-image endpoint — and why it is NOT a fourth tier.
 *
 * `tier` picks a price/quality point for painting from nothing. Reference-image
 * work is a different question with, here, exactly one answer: Nano Banana Pro's
 * edit endpoint is the only model in this kit that accepts input images at all.
 * Neither FLUX tier does.
 *
 * So `imageUrls` OVERRIDES `tier` rather than combining with it. A caller that
 * passes both gets the edit endpoint, silently — because the alternative is
 * dropping the user's photos on the floor and returning a confident picture of
 * someone else, which is the exact failure this parameter exists to end. Losing
 * the cheap tier is a price change; losing the input images is a wrong answer.
 */
const EDIT_MODEL = { id: 'fal-ai/nano-banana-pro/edit', family: 'nano-banana' } as const;

/**
 * Reference images per call. Two is the common case (a person and a garment);
 * the ceiling is here because every image is read at full size and billed, and
 * an unbounded array is how a client turns one click into a large invoice.
 */
const MAX_REFERENCE_IMAGES = 4;

/** fal's named aspect presets. A free-form {width,height} is not accepted — it is how a caller asks for a 4MP bill. */
const IMAGE_SIZES = [
  'square_hd',
  'square',
  'portrait_4_3',
  'portrait_16_9',
  'landscape_4_3',
  'landscape_16_9',
] as const;
export type FalImageSize = (typeof IMAGE_SIZES)[number];
const DEFAULT_IMAGE_SIZE: FalImageSize = 'landscape_4_3';

const MAX_PROMPT_CHARS = 1000;

/**
 * Poll cadence and the hard ceiling on one generation, PER FAMILY.
 *
 * schnell lands in ~1-3s and dev in ~10s, so 90s is already generous for FLUX.
 * Nano Banana Pro thinks before it renders and is routinely slower, so it gets
 * its own, longer ceiling — a shared 90s would have turned ordinary slow
 * generations into 504s.
 */
const POLL_INTERVAL_MS = 700;
const TIMEOUT_MS: Record<ModelFamily, number> = {
  flux: 90_000,
  'nano-banana': 180_000,
};

/**
 * Per-user rate limit — BEST EFFORT, in memory, and honest about it.
 *
 * It resets when the container restarts and is not shared across instances, so
 * it is not a billing control. It exists to blunt the one failure that actually
 * costs money: a loop or a double-click storm firing dozens of generations in a
 * few seconds. A real spend cap belongs on the fal account, where the owner sets
 * it. Raise the ceiling with IMAGE_HOURLY_LIMIT_PER_USER if the app's economics
 * support it.
 */
const HOURLY_LIMIT_PER_USER = Number(process.env.IMAGE_HOURLY_LIMIT_PER_USER ?? 30);
const RATE_WINDOW_MS = 60 * 60_000;
const recentGenerations = new Map<string, number[]>();

/**
 * The SAME aspect, said two different ways.
 *
 * The kit's public vocabulary is FLUX's named presets, because that is what the
 * contract and <GenerateImageButton> already speak and changing it would break
 * every caller. Nano Banana does not accept them — it wants a bare ratio — so
 * the translation lives here rather than leaking the split into app code.
 *
 * `square_hd` and `square` both land on 1:1: the distinction is FLUX's
 * resolution hint, and Nano Banana has no equivalent knob.
 *
 * EDITING WITH NO SIZE NAMED IS DIFFERENT. The presets exist to choose a shape
 * out of thin air; when the caller has handed us the user's own photo and named
 * no preset, the right shape is already in that photo. `AUTO_ASPECT` tells the
 * edit endpoint to keep it, which is what a full-body try-on or a room restyle
 * wants — a default of landscape_4_3 would crop a standing person's head off.
 */
const AUTO_ASPECT = 'auto';

const ASPECT_RATIOS: Record<FalImageSize, string> = {
  square_hd: '1:1',
  square: '1:1',
  portrait_4_3: '3:4',
  portrait_16_9: '9:16',
  landscape_4_3: '4:3',
  landscape_16_9: '16:9',
};

/**
 * Build the request body for whichever family this tier belongs to.
 *
 * THE TWO FAMILIES DO NOT SHARE AN INPUT SCHEMA, and sending one's parameters
 * to the other is a 422, not a silently ignored field. Keeping the difference
 * in this one function is what lets the rest of generateImage() stay
 * model-agnostic.
 *
 * Common to both, and deliberate: `num_images: 1` (generation bills per image,
 * and no seam in this platform asks for a grid) and `output_format: 'jpeg'`
 * (persistImage names the stored file from the content type).
 */
interface BuildInputArgs {
  family: ModelFamily;
  prompt: string;
  imageSize: FalImageSize;
  /** Nano Banana only: the ratio to send, or AUTO_ASPECT to inherit the reference image's. */
  aspectRatio: string;
  seed?: number;
  /** Non-empty only on the edit endpoint — validated by normalizeImageUrls. */
  imageUrls?: string[];
}

function buildInput(args: BuildInputArgs): Record<string, unknown> {
  const common = {
    prompt: args.prompt,
    num_images: 1,
    output_format: 'jpeg',
    ...(Number.isFinite(args.seed) ? { seed: Number(args.seed) } : {}),
  };
  if (args.family === 'nano-banana') {
    return {
      ...common,
      aspect_ratio: args.aspectRatio,
      ...(args.imageUrls?.length ? { image_urls: args.imageUrls } : {}),
    };
    // safety_tolerance is left at fal's own default on purpose — picking a
    // number here would be guessing at a policy the app owner never set.
  }
  return { ...common, image_size: args.imageSize, enable_safety_checker: true };
}

/**
 * Validate the caller's reference images, or explain exactly what is wrong.
 *
 * fal FETCHES each of these URLs from its own servers, which is the whole
 * constraint: a localhost URL, a path, or a URL behind the app's own auth is
 * not reachable from there and comes back as an upstream 4xx that reads like a
 * prompt problem. Uploads in this app already return a public media URL, so the
 * normal path is to pass exactly what /api/uploads gave you.
 *
 * data: URIs are refused rather than forwarded. They inflate the request body
 * by a third, and a caller reaching for one is nearly always about to send an
 * unbounded original straight off a phone camera.
 */
function normalizeImageUrls(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new FalError(400, 'imageUrls must be an array of image URLs.');
  const urls = raw.map((u) => String(u ?? '').trim()).filter((u) => u.length > 0);
  if (urls.length === 0) return [];
  if (urls.length > MAX_REFERENCE_IMAGES) {
    throw new FalError(400, `At most ${MAX_REFERENCE_IMAGES} reference images can be used in one generation.`);
  }
  for (const u of urls) {
    if (!/^https?:\/\//i.test(u)) {
      throw new FalError(
        400,
        'Each reference image must be a public http(s) URL that the image service can fetch — not a data URI, a file path, or a localhost address.',
      );
    }
  }
  return urls;
}

// ─── plumbing ──────────────────────────────────────────────────────────────

const INTEGRATION = 'Fal AI';
const NOT_CONFIGURED_MESSAGE = 'Fal AI API key is not configured.';

function apiKey(): string {
  return (process.env.FAL_KEY ?? '').trim();
}

/** True once the owner has supplied FAL_KEY. Check before calling generateImage. */
export function isFalConfigured(): boolean {
  return Boolean(apiKey());
}

/**
 * Thrown by generateImage. `status` is the HTTP status the caller should answer
 * with; `message` is already user-safe — never the raw upstream body, never the
 * key.
 */
export class FalError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'FalError';
  }
}

export interface GenerateImageArgs {
  /** 1..1000 chars. Describe the subject, the style and the framing. */
  prompt: string;
  /** One of fal's named presets. Omit for landscape_4_3. */
  imageSize?: FalImageSize;
  /**
   * 'best' (nano-banana-pro, the DEFAULT — best quality and the only tier that
   * renders readable text in the image), 'fast' (flux/schnell, cheapest and
   * quickest) or 'quality' (flux/dev). Omit unless you have a reason.
   */
  tier?: ModelTier;
  /** Pin for a reproducible image. Omit and every call gives a different picture. */
  seed?: number;
  /**
   * Reference images the OUTPUT MUST CONTAIN — the user's own photo, the
   * garment, the room, the product. Public http(s) URLs (what /api/uploads
   * returns), at most 4.
   *
   * Pass this whenever the result is supposed to show something the user
   * supplied. `prompt` then says what to DO with them ("put the person from the
   * first image in the outfit from the second, full body, keep their face"),
   * not what they look like. Omitting it does not degrade the result — it
   * produces a completely different person or object, convincingly.
   *
   * Supplying it routes to fal's edit endpoint and overrides `tier`.
   */
  imageUrls?: string[];
}

export interface GeneratedImage {
  /**
   * THE APP'S OWN permanent URL in the normal case. It is fal's expiring CDN
   * URL only when the project has no upload storage configured, and
   * `stored` then says so.
   */
  url: string;
  width: number;
  height: number;
  contentType: string;
  /** Echoed back so a caller can pin it to regenerate the same image. */
  seed: number | null;
  /** The fal endpoint that produced it. */
  model: string;
  /** false → `url` is fal's copy and will stop working in about 7 days. */
  stored: boolean;
}

function userSafeMessage(status: number): string {
  if (status === 401 || status === 403) return NOT_CONFIGURED_MESSAGE;
  if (status === 402) return 'The connected Fal AI account is out of credit — top it up to keep generating images.';
  if (status === 429) return 'Image generation is busy right now — please try again shortly.';
  if (status === 400 || status === 422) {
    return 'The image service rejected this request — try a different prompt.';
  }
  return 'The image service is unavailable right now.';
}

function falFetch(url: string, init?: RequestInit): Promise<globalThis.Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Key ${apiKey()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * Every non-2xx fal answer ends here: log the detail server-side, report it to
 * the platform, hand the caller a safe message. One exit for every helper and
 * adapter, so a new one cannot skip the report.
 */
async function upstreamFailure(resp: globalThis.Response, where: string): Promise<FalError> {
  const detail = await resp.text().catch(() => '');
  console.error(`[fal] ${where} failed (${resp.status}):`, detail.slice(0, 500));
  await reportIntegrationError('fal', where, errorFieldsFromBody(resp.status, detail, resp.headers));
  const status =
    resp.status === 401 || resp.status === 403
      ? 503
      : resp.status === 429
        ? 429
        : resp.status === 400 || resp.status === 422 || resp.status === 402
          ? 400
          : 502;
  return new FalError(status, userSafeMessage(resp.status));
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Park the finished image in the project's own storage.
 *
 * Returns null when storage is unconfigured or the proxy refuses it — the
 * caller then keeps fal's URL, which still renders for about a week. A degraded
 * result beats throwing away an image the owner has already paid for.
 */
async function persistImage(bytes: Buffer, contentType: string): Promise<string | null> {
  if (!config.mediaProxyUrl || !config.mediaUploadToken || !config.projectId) {
    console.warn('[fal] upload proxy not configured — keeping the fal URL (expires in ~7 days)');
    return null;
  }
  const extension = contentType === 'image/png' ? 'png' : 'jpg';
  try {
    const resp = await fetch(
      `${config.mediaProxyUrl}/v1/projects/${config.projectId}/uploads?folder=generated`,
      {
        method: 'POST',
        headers: {
          'x-media-upload-token': config.mediaUploadToken,
          'content-type': 'application/octet-stream',
          'x-content-type': contentType,
          'x-filename': `fal-${Date.now()}.${extension}`,
        },
        body: new Uint8Array(bytes),
      },
    );
    const data: any = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('[fal] upload proxy rejected the image:', data?.error ?? resp.status);
      return null;
    }
    return String(data?.url ?? '') || null;
  } catch (err) {
    console.error('[fal] upload proxy unreachable:', (err as Error).message);
    return null;
  }
}

interface FalQueueSubmission {
  request_id?: string;
  status_url?: string;
  response_url?: string;
}

interface FalImagePayload {
  images?: { url?: string; width?: number; height?: number; content_type?: string }[];
  seed?: number;
}

/**
 * Generate ONE image from a prompt. The single fal call in the app — every
 * image-generation feature routes through here.
 *
 * Submits to the queue, polls until it completes, downloads the result and
 * stores it in the app's own media storage. Throws FalError with a user-safe
 * message (503 when the owner has supplied no key).
 */
export async function generateImage(args: GenerateImageArgs): Promise<GeneratedImage> {
  if (!isFalConfigured()) throw new FalError(503, NOT_CONFIGURED_MESSAGE);

  const prompt = String(args.prompt ?? '').trim();
  if (!prompt) throw new FalError(400, 'prompt is required');
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new FalError(400, `prompt must be at most ${MAX_PROMPT_CHARS} characters`);
  }
  const imageSize = IMAGE_SIZES.includes(args.imageSize as FalImageSize)
    ? (args.imageSize as FalImageSize)
    : DEFAULT_IMAGE_SIZE;
  // `in MODELS` rather than a bare `?? DEFAULT_TIER`: the HTTP route forwards
  // `body.tier` straight through, so at runtime this can be any string a client
  // sent. An unknown tier falls back to the default instead of building a URL
  // out of it.
  const tier: ModelTier = args.tier && args.tier in MODELS ? args.tier : DEFAULT_TIER;
  // Reference images decide the endpoint; see EDIT_MODEL for why they beat tier.
  const imageUrls = normalizeImageUrls(args.imageUrls);
  const { id: model, family } = imageUrls.length ? EDIT_MODEL : MODELS[tier];
  if (imageUrls.length && args.tier && args.tier !== 'best') {
    console.warn(`[fal] tier "${args.tier}" ignored: reference images require ${EDIT_MODEL.id}`);
  }
  // A named preset always wins. With none named, an edit keeps the reference
  // image's own shape (AUTO_ASPECT) while a from-nothing generation falls back
  // to DEFAULT_IMAGE_SIZE — see the note above ASPECT_RATIOS.
  const aspectRatio =
    args.imageSize && IMAGE_SIZES.includes(args.imageSize)
      ? ASPECT_RATIOS[args.imageSize as FalImageSize]
      : imageUrls.length
        ? AUTO_ASPECT
        : ASPECT_RATIOS[DEFAULT_IMAGE_SIZE];

  // 1. Submit.
  let submitResp: globalThis.Response;
  try {
    submitResp = await falFetch(`${QUEUE_BASE}/${model}`, {
      method: 'POST',
      body: JSON.stringify(buildInput({ family, prompt, imageSize, aspectRatio, seed: args.seed, imageUrls })),
    });
  } catch (err) {
    console.error('[fal] submit network failure:', (err as Error).message);
    throw new FalError(502, userSafeMessage(0));
  }
  if (!submitResp.ok) throw await upstreamFailure(submitResp, 'submit');

  const submission = (await submitResp.json().catch(() => null)) as FalQueueSubmission | null;
  const requestId = submission?.request_id;
  if (!requestId) {
    console.error('[fal] submit returned no request_id');
    throw new FalError(502, userSafeMessage(0));
  }
  // Trust fal's own URLs when it supplies them; fall back to the documented
  // shape so a response missing them still completes.
  const statusUrl = submission?.status_url ?? `${QUEUE_BASE}/${model}/requests/${requestId}/status`;
  const resultUrl = submission?.response_url ?? `${QUEUE_BASE}/${model}/requests/${requestId}`;

  // 2. Poll. Bounded by this family's ceiling — see TIMEOUT_MS.
  const timeoutMs = TIMEOUT_MS[family];
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() > deadline) {
      console.error(`[fal] generation timed out after ${timeoutMs}ms (request ${requestId})`);
      throw new FalError(504, 'Image generation took too long — please try again.');
    }
    await sleep(POLL_INTERVAL_MS);

    let statusResp: globalThis.Response;
    try {
      statusResp = await falFetch(statusUrl);
    } catch (err) {
      console.error('[fal] status network failure:', (err as Error).message);
      throw new FalError(502, userSafeMessage(0));
    }
    if (!statusResp.ok) throw await upstreamFailure(statusResp, 'status');

    const status = String(((await statusResp.json().catch(() => null)) as any)?.status ?? '');
    if (status === 'COMPLETED') break;
    // IN_QUEUE / IN_PROGRESS: keep waiting. Any other value is a shape we do
    // not know, and waiting on it is better than guessing it failed.
  }

  // 3. Collect.
  let resultResp: globalThis.Response;
  try {
    resultResp = await falFetch(resultUrl);
  } catch (err) {
    console.error('[fal] result network failure:', (err as Error).message);
    throw new FalError(502, userSafeMessage(0));
  }
  if (!resultResp.ok) throw await upstreamFailure(resultResp, 'result');

  const payload = (await resultResp.json().catch(() => null)) as FalImagePayload | null;
  const image = payload?.images?.[0];
  if (!image?.url) {
    console.error('[fal] result carried no image url');
    throw new FalError(502, userSafeMessage(0));
  }
  const contentType = image.content_type ?? 'image/jpeg';

  // 4. Copy the bytes into the app's own storage. fal's copy expires.
  let url = image.url;
  let stored = false;
  try {
    const bytesResp = await fetch(image.url);
    if (bytesResp.ok) {
      const persisted = await persistImage(Buffer.from(await bytesResp.arrayBuffer()), contentType);
      if (persisted) {
        url = persisted;
        stored = true;
      }
    } else {
      console.error(`[fal] could not download the finished image (${bytesResp.status})`);
    }
  } catch (err) {
    console.error('[fal] could not download the finished image:', (err as Error).message);
  }

  return {
    url,
    width: image.width ?? 0,
    height: image.height ?? 0,
    contentType,
    seed: typeof payload?.seed === 'number' ? payload.seed : null,
    model,
    stored,
  };
}

// ── Video generation — the video-gen capability adapter ─────────────────────
//
// Two STATELESS calls over fal's queue: submit now, poll later. The capability's
// own route owns the job table and copies the finished clip into the app's
// storage (fal's copy expires). Kling 2.1 standard: a few seconds, 16:9/9:16,
// text-to-video or image-to-video.

const VIDEO_MODELS = {
  text: 'fal-ai/kling-video/v2.1/standard/text-to-video',
  image: 'fal-ai/kling-video/v2.1/standard/image-to-video',
} as const;
const MAX_VIDEO_PROMPT_CHARS = 1500;

export interface StartVideoArgs {
  prompt: string;
  imageUrl?: string;
  durationSecs?: 4 | 6 | 8;
  aspectRatio?: '16:9' | '9:16';
}
export interface StartVideoResult {
  /** Opaque: fal's request id plus the status/result URLs it handed back. */
  operationId: string;
  model: string;
}
export type CheckVideoResult =
  | { status: 'pending' }
  | { status: 'ready'; video: Buffer | null; videoUrl: string | null; contentType: string }
  | { status: 'failed'; message: string };

interface FalVideoHandle {
  requestId: string;
  statusUrl: string;
  resultUrl: string;
}

/** Submit ONE clip to fal's queue and return at once with the handle to poll. Throws FalError. */
export async function startVideo(args: StartVideoArgs): Promise<StartVideoResult> {
  if (!isFalConfigured()) throw new FalError(503, NOT_CONFIGURED_MESSAGE);
  const prompt = String(args.prompt ?? '').trim();
  if (!prompt) throw new FalError(400, 'prompt is required');
  if (prompt.length > MAX_VIDEO_PROMPT_CHARS) throw new FalError(400, `prompt must be at most ${MAX_VIDEO_PROMPT_CHARS} characters`);
  const imageUrl = String(args.imageUrl ?? '').trim();
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) throw new FalError(400, 'imageUrl must be a public http(s) URL');
  const model = imageUrl ? VIDEO_MODELS.image : VIDEO_MODELS.text;
  // Kling takes "5" or "10" seconds; the capability's 4/6/8 map onto them.
  const duration = Number(args.durationSecs) >= 8 ? '10' : '5';
  const aspect_ratio = args.aspectRatio === '9:16' ? '9:16' : '16:9';

  let submitResp: globalThis.Response;
  try {
    submitResp = await falFetch(`${QUEUE_BASE}/${model}`, {
      method: 'POST',
      body: JSON.stringify({ prompt, duration, aspect_ratio, ...(imageUrl ? { image_url: imageUrl } : {}) }),
    });
  } catch (err) {
    console.error('[fal] video submit network failure:', (err as Error).message);
    throw new FalError(502, userSafeMessage(0));
  }
  if (!submitResp.ok) throw await upstreamFailure(submitResp, 'video submit');
  const submission = (await submitResp.json().catch(() => null)) as FalQueueSubmission | null;
  const requestId = submission?.request_id;
  if (!requestId) {
    console.error('[fal] video submit returned no request_id');
    throw new FalError(502, userSafeMessage(0));
  }
  const handle: FalVideoHandle = {
    requestId,
    statusUrl: submission?.status_url ?? `${QUEUE_BASE}/${model}/requests/${requestId}/status`,
    resultUrl: submission?.response_url ?? `${QUEUE_BASE}/${model}/requests/${requestId}`,
  };
  return { operationId: JSON.stringify(handle), model };
}

/** Poll a queued fal clip. On completion returns fal's (expiring) URL to copy from. Throws FalError. */
export async function checkVideo(args: { operationId: string; model?: string }): Promise<CheckVideoResult> {
  if (!isFalConfigured()) throw new FalError(503, NOT_CONFIGURED_MESSAGE);
  let handle: FalVideoHandle | null = null;
  try {
    handle = JSON.parse(args.operationId) as FalVideoHandle;
  } catch {
    /* not ours */
  }
  if (!handle?.statusUrl || !handle.resultUrl) return { status: 'failed', message: 'This video was never submitted successfully.' };

  let statusResp: globalThis.Response;
  try {
    statusResp = await falFetch(handle.statusUrl);
  } catch (err) {
    console.error('[fal] video status network failure:', (err as Error).message);
    throw new FalError(502, userSafeMessage(0));
  }
  if (!statusResp.ok) throw await upstreamFailure(statusResp, 'video status');
  const status = String(((await statusResp.json().catch(() => null)) as any)?.status ?? '');
  if (status !== 'COMPLETED') return { status: 'pending' }; // IN_QUEUE / IN_PROGRESS / unknown: keep waiting

  let resultResp: globalThis.Response;
  try {
    resultResp = await falFetch(handle.resultUrl);
  } catch (err) {
    console.error('[fal] video result network failure:', (err as Error).message);
    throw new FalError(502, userSafeMessage(0));
  }
  if (!resultResp.ok) throw await upstreamFailure(resultResp, 'video result');
  const payload = (await resultResp.json().catch(() => null)) as { video?: { url?: string; content_type?: string } } | null;
  const url = payload?.video?.url;
  if (!url) return { status: 'failed', message: 'The video service returned no clip.' };
  return { status: 'ready', video: null, videoUrl: url, contentType: payload?.video?.content_type ?? 'video/mp4' };
}

// ── HTTP surface — a thin shell over the helper ─────────────────────────────

function notConfigured(res: Response) {
  return res.status(503).json({
    error: 'integration_not_configured',
    integration: INTEGRATION,
    message: NOT_CONFIGURED_MESSAGE,
  });
}

/** Best-effort per-user throttle. See HOURLY_LIMIT_PER_USER for what it is and is not. */
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

// POST /api/image-gen/generate — { prompt, imageSize?, tier?, seed? }
async function generate(req: Request, res: Response): Promise<any> {
  if (!isFalConfigured()) return notConfigured(res);

  // jwtCheck has already run, so req.user is present (see backend/src/middleware.ts).
  if (overRateLimit(String(req.user!.id))) {
    return res.status(429).json({
      error: 'image_rate_limited',
      message: 'You have generated a lot of images recently — please try again later.',
    });
  }

  const body = (req.body ?? {}) as Partial<GenerateImageArgs>;
  try {
    return res.json(
      await generateImage({
        prompt: String(body.prompt ?? ''),
        imageSize: body.imageSize,
        tier: body.tier,
        seed: body.seed,
        imageUrls: body.imageUrls,
      }),
    );
  } catch (err) {
    if (err instanceof FalError) {
      if (err.status === 503) return notConfigured(res);
      return res.status(err.status).json({ message: err.message });
    }
    console.error('[fal] unexpected error:', err);
    return res.status(502).json({ message: userSafeMessage(0) });
  }
}

const router = Router();
// Authenticated: generation costs the owner real money, so none of it is open
// to anonymous traffic. Drop jwtCheck only if the product genuinely needs a
// public generation surface, and add your own rate limiting if you do.
router.post('/generate', middleware.jwtCheck, generate);
export default router;
