// INTEGRATION KIT — Google AI: Veo video generation, plus the Gemini adapters
// (text, image generation, vision, document reading, transcription, embeddings).
//
// Staged verbatim when the project owner supplies GEMINI_API_KEY. The video
// job lifecycle below is this kit's own feature; the Gemini adapters at the
// bottom exist so the owner can choose Google for any switchable capability —
// app code reaches them ONLY through backend/src/custom/capabilities/*.
//
// ─── WHY THIS FILE LOOKS DIFFERENT FROM EVERY OTHER KIT ────────────────────
//
// Every other kit in this platform wraps a request/response API. Veo does not:
// generation is a LONG-RUNNING OPERATION that takes minutes. So this file owns
// a job lifecycle instead of a single call:
//
//   POST /api/video/generate  → submit, persist a VeoVideoJob row, return id
//   GET  /api/video/jobs/:id  → ask Veo how it's going; on the FIRST completion,
//                               download the bytes, park them in the project's
//                               own storage, flip the row to 'ready'
//   GET  /api/video/jobs      → this user's recent generations
//
// THERE IS NO BACKGROUND WORKER, ON PURPOSE. A generated app has no scheduler
// infrastructure, and an in-process setInterval dies with the container —
// stranding every in-flight job and losing money already spent. Driving the
// poll from the CLIENT means a restart costs nothing: the next poll picks up
// exactly where the last one left off, because all the state lives in Postgres
// and in Veo's own operation.
//
// ─── WHY WE COPY THE BYTES ─────────────────────────────────────────────────
//
// Veo deletes the generated file after ~48 hours. Storing Google's URI would
// give the app a link that dies within the week. On completion we download once
// and push the bytes through the platform's upload proxy (the same one
// /api/uploads uses), then store OUR url. `videoUrl` is always ours.
//
// ─── WHY THE COST GUARDS ARE NOT OPTIONAL ──────────────────────────────────
//
// Veo has no free tier and bills per SECOND of output. One 8-second clip on the
// standard model costs the app owner real money — more than a thousand chat
// completions. Hence: a per-user daily cap enforced server-side, a hard ceiling
// on duration, and a default of the fast model at 720p. A client cannot raise
// any of these; it can only ask for less.
import { Request, Response, Router } from 'express';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GoogleGenAI, GenerateVideosOperation, Modality } from '@google/genai';
import { prisma } from '../../lib/prisma';
import middleware from '../../middleware';
import config from '../../../config';
// Owner-actionable provider errors are reported to the platform dashboard.
import { errorFieldsFromError, reportIntegrationError } from './integrationSignal';

// ─── tuning ────────────────────────────────────────────────────────────────

/**
 * Fast, not standard. The quality gap is modest; the price gap is ~4x
 * ($0.10/sec vs $0.40/sec at 720p). An app that genuinely needs the standard
 * model can pass model: 'standard' per request.
 */
const MODELS = {
  fast: 'veo-3.1-fast-generate-preview',
  standard: 'veo-3.1-generate-preview',
} as const;
type ModelTier = keyof typeof MODELS;

/** Veo accepts 4, 6 or 8 seconds. Anything else is rejected upstream. */
const ALLOWED_DURATIONS = [4, 6, 8] as const;
const DEFAULT_DURATION = 8;

/** 1080p is permitted; 4K is not — it triples the cost and blows the upload cap. */
const ALLOWED_RESOLUTIONS = ['720p', '1080p'] as const;
const DEFAULT_RESOLUTION = '720p';

const ALLOWED_ASPECTS = ['16:9', '9:16'] as const;
const DEFAULT_ASPECT = '16:9';

/**
 * Per-user, per-day generation cap.
 *
 * A blunt instrument, and deliberately so: without it a single user clicking a
 * button forty times costs the owner more than their monthly plan. Raise it by
 * setting VIDEO_DAILY_LIMIT_PER_USER if the app's economics support it.
 */
const DAILY_LIMIT_PER_USER = Number(process.env.VIDEO_DAILY_LIMIT_PER_USER ?? 5);

/** Prompt ceiling — long enough for scene + dialogue direction, short enough to bound cost. */
const MAX_PROMPT_CHARS = 1500;

// ─── plumbing ──────────────────────────────────────────────────────────────

function apiKey(): string {
  return (process.env.GEMINI_API_KEY ?? '').trim();
}

/** True once the owner has supplied GEMINI_API_KEY. Check before calling startVideoGeneration. */
export function isGoogleAIConfigured(): boolean {
  return Boolean(apiKey());
}

/**
 * Construct LAZILY, inside the handler — never at module top level. A missing
 * key must not crash boot; the router still mounts and its routes answer 503,
 * so adding the key later and redeploying activates the feature with no code
 * change.
 */
function client(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: apiKey() });
}

function notConfigured(res: Response) {
  return res.status(503).json({
    error: 'integration_not_configured',
    integration: 'Google Veo',
    message: 'Google Veo is not configured.',
  });
}

/**
 * Map a provider failure to a user-safe response.
 *
 * The billing case gets its OWN status and code rather than folding into
 * "not configured". They look identical from the outside — nothing generates —
 * but the fix is opposite: not-configured means the owner must paste a key,
 * billing means the key is correct and Google needs billing enabled on it.
 * Collapsing them sends the owner round a loop re-pasting a key that was right.
 */
function providerError(res: Response, err: unknown) {
  const e = err as { status?: number; message?: string };
  const msg = String(e?.message ?? '');
  console.error(`[veo] request failed (${e?.status ?? '?'}):`, msg);

  if (e?.status === 401 || e?.status === 403) {
    // 403 with a billing hint is the "key is fine, billing is off" case.
    if (/billing|quota project|not enabled|permission/i.test(msg)) {
      return res.status(402).json({
        error: 'video_billing_required',
        message:
          'Video generation is not enabled on this Google account. Enable billing for the Gemini API to generate videos.',
      });
    }
    return notConfigured(res);
  }
  if (e?.status === 429) {
    return res.status(429).json({
      error: 'video_rate_limited',
      message: 'Too many video requests right now — please try again shortly.',
    });
  }
  if (e?.status === 400) {
    return res.status(422).json({
      error: 'video_rejected',
      message: 'That prompt was rejected. Try describing the scene differently.',
    });
  }
  return res.status(502).json({
    error: 'video_upstream_error',
    message: 'The video service is unavailable right now.',
  });
}

/**
 * Report a failure Google answered (ApiError carries the HTTP status and the
 * JSON body). Errors without a status — network, disk, database — are skipped.
 */
async function reportFailure(err: unknown, op: string): Promise<void> {
  if ((err as { status?: unknown })?.status) await reportIntegrationError('google-ai', op, errorFieldsFromError(err));
}

/** Midnight-to-now window for the daily cap. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the finished clip's bytes out of the SDK.
 *
 * THIS IS FIDDLIER THAN IT LOOKS, so do not "simplify" it. `ai.files.download()`
 * returns Promise<void> and REQUIRES a `downloadPath` — it writes to disk and
 * hands back nothing. Treating its return value as the bytes yields `undefined`
 * and silently stores a 0-byte video.
 *
 * Two transports, in preference order:
 *   1. `videoBytes` — base64 inline on the operation response. No I/O at all.
 *   2. `uri` + downloadPath — the SDK writes the file, we read it back and
 *      delete it. Runs in the container's own tmpdir, which is writable and
 *      ephemeral; the unlink is best-effort because a leaked temp file is much
 *      cheaper than failing a clip the owner already paid for.
 */
async function readVideoBytes(video: any): Promise<Buffer | null> {
  if (typeof video?.videoBytes === 'string' && video.videoBytes.length > 0) {
    return Buffer.from(video.videoBytes, 'base64');
  }
  if (!video?.uri) return null;

  const tmpPath = join(tmpdir(), `veo-${randomUUID()}.mp4`);
  try {
    await client().files.download({ file: video, downloadPath: tmpPath });
    const bytes = await readFile(tmpPath);
    return bytes.length > 0 ? bytes : null;
  } catch (err) {
    console.error('[veo] could not download the finished clip:', (err as Error).message);
    await reportFailure(err, 'download');
    return null;
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }
}

/**
 * Park the finished clip in the project's own storage.
 *
 * Returns null when storage is unconfigured — the caller then keeps the row in
 * 'ready' with the provider URL, which still plays for ~48h. A degraded result
 * beats throwing away a clip the owner has already paid for.
 */
async function persistVideo(bytes: Buffer, jobId: string): Promise<string | null> {
  if (!config.mediaProxyUrl || !config.mediaUploadToken || !config.projectId) {
    console.warn('[veo] upload proxy not configured — keeping the provider URL (expires in ~48h)');
    return null;
  }
  try {
    const resp = await fetch(
      `${config.mediaProxyUrl}/v1/projects/${config.projectId}/uploads?folder=video`,
      {
        method: 'POST',
        headers: {
          'x-media-upload-token': config.mediaUploadToken,
          'content-type': 'application/octet-stream',
          'x-content-type': 'video/mp4',
          'x-filename': `${jobId}.mp4`,
        },
        body: new Uint8Array(bytes),
      },
    );
    const data: any = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('[veo] upload proxy rejected the clip:', data?.error ?? resp.status);
      return null;
    }
    return String(data?.url ?? '') || null;
  } catch (err) {
    console.error('[veo] upload proxy unreachable:', (err as Error).message);
    return null;
  }
}

// ─── Gemini adapters — the switchable-capability side of this kit ──────────
//
// Same argument/result shapes as the other providers' adapters, so a facade
// (backend/src/custom/capabilities/<cap>.ts) can re-export any of them
// unchanged. Everything here throws GoogleAIError { status, message } with a
// user-safe message — the video routes above keep their own response mapping.

const GEMINI_TEXT_MODEL = 'gemini-2.5-flash';
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';
const GEMINI_EMBED_MODEL = 'gemini-embedding-001';
const NOT_CONFIGURED_MESSAGE = 'Google AI API key is not configured.';
const MAX_TEXT_TOKENS = 8192;
// Inline request parts: Gemini accepts up to 20 MB per request.
const MAX_INLINE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PROMPT_CHARS = 1000;
const MAX_REFERENCE_IMAGES = 4;
const MAX_INLINE_TEXT_CHARS = 200_000;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/** Thrown by every Gemini adapter. `message` is user-safe; `status` is the HTTP status to answer with. */
export class GoogleAIError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleAIError';
  }
}

/** Map an SDK failure to a user-safe error; never leaks the key or the raw body. */
function toGoogleAIError(err: unknown, where: string): GoogleAIError {
  const e = (err ?? {}) as { status?: number; message?: string };
  const msg = String(e.message ?? '');
  console.error(`[google-ai] ${where} failed (${e.status ?? 'no response'}):`, msg.slice(0, 300));
  const status = e.status;
  if (!status) return new GoogleAIError(502, "Couldn't reach the AI service. Please try again.");
  if (status === 401 || status === 403) {
    if (/billing|quota project|not enabled|permission/i.test(msg)) {
      return new GoogleAIError(402, 'This feature is not enabled on the connected Google account. Enable billing for the Gemini API.');
    }
    return new GoogleAIError(503, NOT_CONFIGURED_MESSAGE);
  }
  if (status === 429) return new GoogleAIError(429, 'AI is busy right now — please try again shortly.');
  if (status === 404) return new GoogleAIError(400, "This AI model isn't available on the connected account.");
  if (status === 400 || status === 413 || status === 422) {
    return new GoogleAIError(400, "The AI couldn't process this request. Try shorter text or a smaller file.");
  }
  if (status >= 500) return new GoogleAIError(502, 'The AI service is temporarily unavailable. Please try again.');
  return new GoogleAIError(502, 'The AI service is unavailable right now.');
}

/**
 * Every adapter catch ends here: report what Google answered, then map it.
 * The adapters are what capability facades call, so this — not the video
 * routes — is the path most apps take. Our own GoogleAIError is not a
 * provider answer and is never reported.
 */
async function providerFailure(err: unknown, where: string): Promise<GoogleAIError> {
  if (!(err instanceof GoogleAIError)) await reportFailure(err, where);
  return toGoogleAIError(err, where);
}

function clampTokens(n: unknown, fallback: number): number {
  return Math.min(Math.max(Number(n) || fallback, 1), MAX_TEXT_TOKENS);
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface ChatArgs {
  messages: ChatMessage[];
  system?: string;
  model?: string;
  maxTokens?: number;
}
export interface ChatResult {
  content: string;
  model: string;
  finishReason: string;
}

/** One Gemini completion. Throws GoogleAIError (503 when not configured, 400 on empty input). */
export async function chatCompletion(args: ChatArgs): Promise<ChatResult> {
  if (!isGoogleAIConfigured()) throw new GoogleAIError(503, NOT_CONFIGURED_MESSAGE);
  const turns = (args.messages ?? [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  if (turns.length === 0) throw new GoogleAIError(400, 'messages must contain at least one entry');
  const model = args.model || GEMINI_TEXT_MODEL;
  try {
    const res = await client().models.generateContent({
      model,
      contents: turns,
      config: {
        ...(args.system ? { systemInstruction: args.system } : {}),
        maxOutputTokens: clampTokens(args.maxTokens, 1024),
      },
    });
    return {
      content: res.text ?? '',
      model,
      finishReason: String(res.candidates?.[0]?.finishReason ?? 'STOP'),
    };
  } catch (err) {
    throw await providerFailure(err, 'chat');
  }
}

export interface AnalyzeImageArgs {
  prompt: string;
  image?: Buffer;
  mimeType?: string;
  imageUrl?: string;
  system?: string;
  maxTokens?: number;
}

/** Resolve `image` or `imageUrl` to validated inline bytes. */
async function resolveImage(args: AnalyzeImageArgs): Promise<{ bytes: Buffer; mime: string }> {
  const hasBytes = !!args.image && args.image.length > 0;
  const url = String(args.imageUrl ?? '').trim();
  if (hasBytes && url) throw new GoogleAIError(400, 'pass either image or imageUrl, not both');
  let bytes: Buffer;
  let mime: string;
  if (hasBytes) {
    bytes = args.image!;
    mime = String(args.mimeType ?? 'image/jpeg').split(';')[0].trim().toLowerCase();
  } else {
    if (!url) throw new GoogleAIError(400, 'image or imageUrl is required');
    if (!/^https?:\/\//i.test(url)) throw new GoogleAIError(400, 'imageUrl must be an http(s) URL');
    const resp = await fetch(url).catch(() => null);
    if (!resp || !resp.ok) {
      throw new GoogleAIError(400, 'The image could not be read — make sure the URL is public and the file is a valid JPEG, PNG, GIF or WebP.');
    }
    mime = (resp.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim().toLowerCase();
    bytes = Buffer.from(await resp.arrayBuffer());
  }
  if (!IMAGE_MIME_TYPES.has(mime)) throw new GoogleAIError(400, 'image must be JPEG, PNG, GIF or WebP');
  if (bytes.length > MAX_INLINE_BYTES) throw new GoogleAIError(400, 'image must be 20 MB or smaller');
  return { bytes, mime };
}

/** Vision: describe, classify, read text from, or answer a question about ONE image. Throws GoogleAIError. */
export async function analyzeImage(args: AnalyzeImageArgs): Promise<ChatResult> {
  if (!isGoogleAIConfigured()) throw new GoogleAIError(503, NOT_CONFIGURED_MESSAGE);
  const prompt = String(args.prompt ?? '').trim();
  if (!prompt) throw new GoogleAIError(400, 'prompt is required');
  const { bytes, mime } = await resolveImage(args);
  try {
    const res = await client().models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{ role: 'user', parts: [{ inlineData: { data: bytes.toString('base64'), mimeType: mime } }, { text: prompt }] }],
      config: {
        ...(args.system ? { systemInstruction: args.system } : {}),
        maxOutputTokens: clampTokens(args.maxTokens, 1024),
      },
    });
    return { content: res.text ?? '', model: GEMINI_TEXT_MODEL, finishReason: String(res.candidates?.[0]?.finishReason ?? 'STOP') };
  } catch (err) {
    if (err instanceof GoogleAIError) throw err;
    throw await providerFailure(err, 'vision');
  }
}

export interface ReadDocumentArgs {
  prompt: string;
  document: Buffer;
  mimeType: string;
  filename?: string;
  system?: string;
  maxTokens?: number;
}

/** Document reading: answer `prompt` about ONE uploaded PDF / page image / text file. Throws GoogleAIError. */
export async function readDocument(args: ReadDocumentArgs): Promise<ChatResult> {
  if (!isGoogleAIConfigured()) throw new GoogleAIError(503, NOT_CONFIGURED_MESSAGE);
  const prompt = String(args.prompt ?? '').trim();
  if (!prompt) throw new GoogleAIError(400, 'prompt is required');
  if (!args.document || args.document.length === 0) throw new GoogleAIError(400, 'document is required');
  if (args.document.length > MAX_INLINE_BYTES) throw new GoogleAIError(400, 'document must be 20 MB or smaller');
  const mime = String(args.mimeType ?? '').split(';')[0].trim().toLowerCase();
  if (IMAGE_MIME_TYPES.has(mime)) {
    return analyzeImage({ prompt, image: args.document, mimeType: mime, system: args.system, maxTokens: args.maxTokens });
  }
  if (mime.startsWith('text/') || mime === 'application/json') {
    const text = args.document.toString('utf8').slice(0, MAX_INLINE_TEXT_CHARS);
    return chatCompletion({
      system: args.system,
      maxTokens: args.maxTokens,
      messages: [{ role: 'user', content: `${prompt}\n\n--- DOCUMENT${args.filename ? ` (${args.filename})` : ''} ---\n${text}` }],
    });
  }
  if (mime !== 'application/pdf') {
    throw new GoogleAIError(400, 'document must be a PDF, an image (JPEG/PNG/GIF/WebP) or plain text');
  }
  try {
    const res = await client().models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [
        { role: 'user', parts: [{ inlineData: { data: args.document.toString('base64'), mimeType: 'application/pdf' } }, { text: prompt }] },
      ],
      config: {
        ...(args.system ? { systemInstruction: args.system } : {}),
        maxOutputTokens: clampTokens(args.maxTokens, 1024),
      },
    });
    return { content: res.text ?? '', model: GEMINI_TEXT_MODEL, finishReason: String(res.candidates?.[0]?.finishReason ?? 'STOP') };
  } catch (err) {
    if (err instanceof GoogleAIError) throw err;
    throw await providerFailure(err, 'document');
  }
}

export interface TranscribeArgs {
  audio: Buffer;
  /** Carries the format: note.webm, call.mp3, memo.m4a. */
  filename: string;
  /** Optional ISO-639-1 hint. */
  language?: string;
}
export interface TranscribeResult {
  text: string;
  model: string;
}

const AUDIO_MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpeg',
  wav: 'audio/wav',
  webm: 'audio/webm',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  aiff: 'audio/aiff',
};

/** Speech-to-text for ONE audio file (<= 20 MB inline). Throws GoogleAIError. */
export async function transcribeAudio(args: TranscribeArgs): Promise<TranscribeResult> {
  if (!isGoogleAIConfigured()) throw new GoogleAIError(503, NOT_CONFIGURED_MESSAGE);
  if (!args.audio || args.audio.length === 0) throw new GoogleAIError(400, 'audio is required');
  if (args.audio.length > MAX_INLINE_BYTES) throw new GoogleAIError(400, 'audio must be 20 MB or smaller');
  const ext = String(args.filename ?? '').split('.').pop()?.toLowerCase() ?? '';
  const mime = AUDIO_MIME_BY_EXT[ext] ?? 'audio/webm';
  const hint = args.language ? ` The speech is in ${args.language}.` : '';
  try {
    const res = await client().models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: args.audio.toString('base64'), mimeType: mime } },
            { text: `Transcribe this audio verbatim. Output only the transcript, with punctuation, no commentary.${hint}` },
          ],
        },
      ],
      config: { maxOutputTokens: MAX_TEXT_TOKENS },
    });
    return { text: (res.text ?? '').trim(), model: GEMINI_TEXT_MODEL };
  } catch (err) {
    throw await providerFailure(err, 'transcribe');
  }
}

export interface EmbedArgs {
  input: string | string[];
  model?: string;
}
export interface EmbedResult {
  embeddings: number[][];
  model: string;
}

/** Embeddings for one or many strings, in input order. Throws GoogleAIError. */
export async function embedText(args: EmbedArgs): Promise<EmbedResult> {
  if (!isGoogleAIConfigured()) throw new GoogleAIError(503, NOT_CONFIGURED_MESSAGE);
  const input = (Array.isArray(args.input) ? args.input : [args.input]).map((v) => String(v ?? '').trim()).filter(Boolean);
  if (input.length === 0) throw new GoogleAIError(400, 'input is required');
  const model = args.model || GEMINI_EMBED_MODEL;
  try {
    const res = await client().models.embedContent({ model, contents: input });
    const embeddings = (res.embeddings ?? []).map((e) => e.values ?? []);
    if (embeddings.length !== input.length) throw new GoogleAIError(502, 'The AI service returned an incomplete embedding set.');
    return { embeddings, model };
  } catch (err) {
    if (err instanceof GoogleAIError) throw err;
    throw await providerFailure(err, 'embed');
  }
}

/** Aspect presets shared by every image provider, mapped onto Gemini's aspect ratios. */
export type ImageSize = 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9';
const IMAGE_ASPECTS: Record<ImageSize, { aspectRatio: string; width: number; height: number }> = {
  square_hd: { aspectRatio: '1:1', width: 1024, height: 1024 },
  square: { aspectRatio: '1:1', width: 1024, height: 1024 },
  portrait_4_3: { aspectRatio: '3:4', width: 896, height: 1200 },
  portrait_16_9: { aspectRatio: '9:16', width: 768, height: 1344 },
  landscape_4_3: { aspectRatio: '4:3', width: 1200, height: 896 },
  landscape_16_9: { aspectRatio: '16:9', width: 1344, height: 768 },
};

export interface GenerateImageArgs {
  prompt: string;
  imageSize?: ImageSize;
  /** Accepted for shape-compatibility; Gemini image generation has no seed. */
  seed?: number;
  /** Public http(s) URLs the output must contain (edit/compose), at most 4. */
  imageUrls?: string[];
}
export interface GeneratedImage {
  url: string;
  width: number;
  height: number;
  contentType: string;
  seed: number | null;
  model: string;
  stored: boolean;
}

/** Park a generated image in the project's own storage; null → caller falls back to a data URL. */
async function persistImage(bytes: Buffer, contentType: string): Promise<string | null> {
  if (!config.mediaProxyUrl || !config.mediaUploadToken || !config.projectId) {
    console.warn('[google-ai] upload proxy not configured — returning the image as a data URL');
    return null;
  }
  const extension = contentType === 'image/jpeg' ? 'jpg' : 'png';
  try {
    const resp = await fetch(`${config.mediaProxyUrl}/v1/projects/${config.projectId}/uploads?folder=generated`, {
      method: 'POST',
      headers: {
        'x-media-upload-token': config.mediaUploadToken,
        'content-type': 'application/octet-stream',
        'x-content-type': contentType,
        'x-filename': `gemini-${Date.now()}.${extension}`,
      },
      body: new Uint8Array(bytes),
    });
    const data: any = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('[google-ai] upload proxy rejected the image:', data?.error ?? resp.status);
      return null;
    }
    return String(data?.url ?? '') || null;
  } catch (err) {
    console.error('[google-ai] upload proxy unreachable:', (err as Error).message);
    return null;
  }
}

/** Generate ONE image (Gemini image model) and store it at the app's own URL. Throws GoogleAIError. */
export async function generateImage(args: GenerateImageArgs): Promise<GeneratedImage> {
  if (!isGoogleAIConfigured()) throw new GoogleAIError(503, NOT_CONFIGURED_MESSAGE);
  const prompt = String(args.prompt ?? '').trim();
  if (!prompt) throw new GoogleAIError(400, 'prompt is required');
  if (prompt.length > MAX_IMAGE_PROMPT_CHARS) {
    throw new GoogleAIError(400, `prompt must be at most ${MAX_IMAGE_PROMPT_CHARS} characters`);
  }
  const refs = (args.imageUrls ?? []).map((u) => String(u ?? '').trim()).filter(Boolean);
  if (refs.length > MAX_REFERENCE_IMAGES) throw new GoogleAIError(400, `imageUrls must contain at most ${MAX_REFERENCE_IMAGES} URLs`);
  const aspect = IMAGE_ASPECTS[args.imageSize ?? 'landscape_4_3'] ?? IMAGE_ASPECTS.landscape_4_3;

  const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];
  for (const url of refs) {
    const { bytes, mime } = await resolveImage({ prompt, imageUrl: url });
    parts.push({ inlineData: { data: bytes.toString('base64'), mimeType: mime } });
  }
  parts.push({ text: prompt });

  let data: string | undefined;
  let mimeType = 'image/png';
  try {
    const res = await client().models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        imageConfig: { aspectRatio: aspect.aspectRatio },
      },
    });
    const image = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    data = image?.inlineData?.data;
    mimeType = image?.inlineData?.mimeType ?? mimeType;
  } catch (err) {
    if (err instanceof GoogleAIError) throw err;
    throw await providerFailure(err, 'image');
  }
  if (!data) throw new GoogleAIError(502, 'The image service returned no image. Please try again.');

  const bytes = Buffer.from(data, 'base64');
  const storedUrl = await persistImage(bytes, mimeType);
  return {
    url: storedUrl ?? `data:${mimeType};base64,${data}`,
    width: aspect.width,
    height: aspect.height,
    contentType: mimeType,
    seed: null,
    model: GEMINI_IMAGE_MODEL,
    stored: storedUrl !== null,
  };
}

const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const DEFAULT_TTS_VOICE = 'Kore';
const MAX_TTS_CHARS = 4000;

export interface SpeakArgs {
  /** 1..4000 chars. */
  text: string;
  /** A Gemini prebuilt voice name (Kore, Puck, Zephyr, Charon, …). Omit for the default. */
  voice?: string;
  /** Accepted for shape-compatibility; the model follows the text's language. */
  language?: string;
}
export interface SpeakResult {
  audio: Buffer;
  contentType: string;
  model: string;
  voice: string;
}

/** Gemini returns raw 16-bit mono PCM; wrap it in a WAV header so any <audio> plays it. */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate (16-bit mono)
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** WAV speech for `text`. Reached through the text-to-speech facade. Throws GoogleAIError. */
export async function speakText(args: SpeakArgs): Promise<SpeakResult> {
  if (!isGoogleAIConfigured()) throw new GoogleAIError(503, NOT_CONFIGURED_MESSAGE);
  const text = String(args.text ?? '').trim();
  if (!text) throw new GoogleAIError(400, 'text is required');
  if (text.length > MAX_TTS_CHARS) throw new GoogleAIError(400, `text must be at most ${MAX_TTS_CHARS} characters`);
  const voice = args.voice?.trim() || DEFAULT_TTS_VOICE;
  let data: string | undefined;
  let mimeType = '';
  try {
    const res = await client().models.generateContent({
      model: GEMINI_TTS_MODEL,
      contents: [{ role: 'user', parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    });
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    data = part?.inlineData?.data;
    mimeType = part?.inlineData?.mimeType ?? '';
  } catch (err) {
    throw await providerFailure(err, 'speech');
  }
  if (!data) throw new GoogleAIError(502, 'The speech service returned no audio. Please try again.');
  const bytes = Buffer.from(data, 'base64');
  // audio/L16;codec=pcm;rate=24000 is the documented output; anything else is passed through.
  const rate = Number(/rate=(\d+)/.exec(mimeType)?.[1] ?? 24000);
  const isPcm = /audio\/L16|pcm/i.test(mimeType) || mimeType === '';
  return {
    audio: isPcm ? pcmToWav(bytes, rate) : bytes,
    contentType: isPcm ? 'audio/wav' : mimeType,
    model: GEMINI_TTS_MODEL,
    voice,
  };
}

export interface AskWebArgs {
  query: string;
  system?: string;
  maxTokens?: number;
}
export interface AskWebResult {
  answer: string;
  citations: string[];
  model: string;
}

/** One web-grounded answer with its source URLs (Gemini + Google Search grounding). Throws GoogleAIError. */
export async function askWeb(args: AskWebArgs): Promise<AskWebResult> {
  if (!isGoogleAIConfigured()) throw new GoogleAIError(503, NOT_CONFIGURED_MESSAGE);
  const query = String(args.query ?? '').trim();
  if (!query) throw new GoogleAIError(400, 'query is required');
  try {
    const res = await client().models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        tools: [{ googleSearch: {} }],
        ...(args.system ? { systemInstruction: args.system } : {}),
        maxOutputTokens: clampTokens(args.maxTokens, 1024),
      },
    });
    const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const citations = [...new Set(chunks.map((c) => c.web?.uri).filter((u): u is string => typeof u === 'string'))];
    return { answer: res.text ?? '', citations, model: GEMINI_TEXT_MODEL };
  } catch (err) {
    throw await providerFailure(err, 'web-search');
  }
}

// ─── Veo as the video-gen capability adapter ────────────────────────────────
//
// Two STATELESS calls: the capability's own route owns the job table and the
// copy-into-storage step. The legacy /api/video routes below keep using the
// kit's VeoVideoJob for apps bound before the capability existed.

export interface StartVideoArgs {
  prompt: string;
  imageUrl?: string;
  durationSecs?: 4 | 6 | 8;
  aspectRatio?: '16:9' | '9:16';
}
export interface StartVideoResult {
  /** Veo's operation name; the poll reconstructs the operation from it. */
  operationId: string;
  model: string;
}
export type CheckVideoResult =
  | { status: 'pending' }
  | { status: 'ready'; video: Buffer | null; videoUrl: string | null; contentType: string }
  | { status: 'failed'; message: string };

/** Submit ONE clip to Veo and return at once with the operation to poll. Throws GoogleAIError. */
export async function startVideo(args: StartVideoArgs): Promise<StartVideoResult> {
  if (!isGoogleAIConfigured()) throw new GoogleAIError(503, NOT_CONFIGURED_MESSAGE);
  const prompt = String(args.prompt ?? '').trim();
  if (!prompt) throw new GoogleAIError(400, 'prompt is required');
  if (prompt.length > MAX_PROMPT_CHARS) throw new GoogleAIError(400, `prompt must be ${MAX_PROMPT_CHARS} characters or fewer`);
  const durationSeconds = ALLOWED_DURATIONS.includes(Number(args.durationSecs) as any) ? Number(args.durationSecs) : DEFAULT_DURATION;
  const aspectRatio = ALLOWED_ASPECTS.includes(String(args.aspectRatio) as any) ? String(args.aspectRatio) : DEFAULT_ASPECT;

  // Image-to-video: inline the still's bytes rather than handing Veo a URL it may not reach.
  let image: { imageBytes: string; mimeType: string } | undefined;
  const imageUrl = String(args.imageUrl ?? '').trim();
  if (imageUrl) {
    const resp = await fetch(imageUrl).catch(() => null);
    if (!resp || !resp.ok) throw new GoogleAIError(400, 'Could not read the source image for this video.');
    image = {
      imageBytes: Buffer.from(await resp.arrayBuffer()).toString('base64'),
      mimeType: resp.headers.get('content-type')?.split(';')[0].trim() || 'image/jpeg',
    };
  }
  try {
    const operation = await client().models.generateVideos({
      model: MODELS.fast,
      prompt,
      ...(image ? { image } : {}),
      config: { durationSeconds, resolution: DEFAULT_RESOLUTION, aspectRatio },
    });
    if (!operation.name) throw new GoogleAIError(502, 'The video service accepted no job.');
    return { operationId: operation.name, model: MODELS.fast };
  } catch (err) {
    if (err instanceof GoogleAIError) throw err;
    throw await providerFailure(err, 'video');
  }
}

/** Poll a Veo operation. Returns the bytes on completion (Veo deletes its copy after ~48h). Throws GoogleAIError. */
export async function checkVideo(args: { operationId: string; model?: string }): Promise<CheckVideoResult> {
  if (!isGoogleAIConfigured()) throw new GoogleAIError(503, NOT_CONFIGURED_MESSAGE);
  try {
    // A real GenerateVideosOperation INSTANCE, not a `{ name }` literal — see jobStatus below.
    const pending = new GenerateVideosOperation();
    pending.name = args.operationId;
    const operation = await client().operations.getVideosOperation({ operation: pending });
    if (!operation.done) return { status: 'pending' };
    if (operation.error) return { status: 'failed', message: String(operation.error.message ?? 'Generation failed.') };
    const video = operation.response?.generatedVideos?.[0]?.video;
    if (!video) return { status: 'failed', message: 'The video service returned no clip.' };
    const bytes = await readVideoBytes(video);
    const uri = typeof (video as any).uri === 'string' ? String((video as any).uri) : null;
    if (!bytes && !uri) return { status: 'failed', message: 'The finished video could not be retrieved.' };
    return { status: 'ready', video: bytes, videoUrl: uri, contentType: 'video/mp4' };
  } catch (err) {
    throw await providerFailure(err, 'video-status');
  }
}

// ─── routes ────────────────────────────────────────────────────────────────

// POST /api/video/generate
// { prompt, imageUrl?, durationSecs?, resolution?, aspectRatio?, model? }
async function generate(req: Request, res: Response): Promise<any> {
  if (!apiKey()) return notConfigured(res);

  const body = (req.body ?? {}) as Record<string, unknown>;
  const prompt = String(body.prompt ?? '').trim();
  if (!prompt) return res.status(400).json({ message: 'prompt is required' });
  if (prompt.length > MAX_PROMPT_CHARS) {
    return res.status(400).json({ message: `prompt must be ${MAX_PROMPT_CHARS} characters or fewer` });
  }

  const userId = req.user!.id;

  // Cost guard. Checked BEFORE submitting, because once Veo accepts the
  // operation the money is committed whether or not anyone watches the result.
  const usedToday = await prisma.veoVideoJob.count({
    where: { userId, createdAt: { gte: startOfToday() } },
  });
  if (usedToday >= DAILY_LIMIT_PER_USER) {
    return res.status(429).json({
      error: 'video_daily_limit',
      message: `You've reached today's limit of ${DAILY_LIMIT_PER_USER} videos. Try again tomorrow.`,
    });
  }

  const durationSecs = ALLOWED_DURATIONS.includes(Number(body.durationSecs) as any)
    ? Number(body.durationSecs)
    : DEFAULT_DURATION;
  const resolution = ALLOWED_RESOLUTIONS.includes(String(body.resolution) as any)
    ? String(body.resolution)
    : DEFAULT_RESOLUTION;
  const aspectRatio = ALLOWED_ASPECTS.includes(String(body.aspectRatio) as any)
    ? String(body.aspectRatio)
    : DEFAULT_ASPECT;
  const tier: ModelTier = String(body.model) === 'standard' ? 'standard' : 'fast';

  // Image-to-video: animate a still the app already owns. The URL must be
  // fetchable by this server; we inline the bytes rather than handing Veo a URL
  // it may not be able to reach.
  let imagePart: { imageBytes: string; mimeType: string } | undefined;
  const imageUrl = String(body.imageUrl ?? '').trim();
  if (imageUrl) {
    try {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error(`status ${imgRes.status}`);
      const mimeType = imgRes.headers.get('content-type')?.split(';')[0].trim() || 'image/jpeg';
      const buf = Buffer.from(await imgRes.arrayBuffer());
      imagePart = { imageBytes: buf.toString('base64'), mimeType };
    } catch (err) {
      return res.status(400).json({
        message: 'Could not read the source image for this video.',
      });
    }
  }

  try {
    const operation = await client().models.generateVideos({
      model: MODELS[tier],
      prompt,
      ...(imagePart ? { image: imagePart } : {}),
      config: { durationSeconds: durationSecs, resolution, aspectRatio },
    });

    const job = await prisma.veoVideoJob.create({
      data: {
        userId,
        prompt,
        operationId: operation.name ?? null,
        status: 'pending',
        durationSecs,
        resolution,
        aspectRatio,
        model: MODELS[tier],
      },
    });

    // 202: accepted, not done. The client polls /jobs/:id from here.
    return res.status(202).json({
      id: job.id,
      status: 'pending',
      estimatedSeconds: 120,
    });
  } catch (err) {
    await reportFailure(err, 'generate');
    return providerError(res, err);
  }
}

/**
 * GET /api/video/jobs/:id — status, and the place completion actually happens.
 *
 * Idempotent by design: a row already 'ready' or 'failed' short-circuits, so
 * two browser tabs polling the same job cannot download or upload twice.
 */
async function jobStatus(req: Request, res: Response): Promise<any> {
  const job = await prisma.veoVideoJob.findUnique({ where: { id: String(req.params.id) } });
  if (!job || job.userId !== req.user!.id) {
    return res.status(404).json({ message: 'Video not found' });
  }
  if (job.status !== 'pending') return res.json(serialize(job));
  if (!apiKey()) return notConfigured(res);
  if (!job.operationId) {
    const failed = await fail(job.id, 'This video was never submitted successfully.');
    return res.json(serialize(failed));
  }

  try {
    // MUST be a real GenerateVideosOperation INSTANCE, not a `{ name }` literal.
    // getVideosOperation() fetches the raw status and then calls
    // `operation._fromAPIResponse(...)` on the object you handed it, so a plain
    // object dies with "operation._fromAPIResponse is not a function" — a 502
    // that reads as a provider outage while the provider is perfectly healthy.
    // (An `as any` cast on the argument hides exactly this, which is why the
    // name is assigned onto a constructed instance instead.)
    //
    // Only `name` is persisted, and only `name` needs to be set: that is what
    // lets a poll resume in a DIFFERENT request — or a different container —
    // from the one that submitted the job.
    const pending = new GenerateVideosOperation();
    pending.name = job.operationId;
    const operation = await client().operations.getVideosOperation({ operation: pending });

    if (!operation.done) return res.json(serialize(job));

    if (operation.error) {
      const failed = await fail(job.id, String(operation.error.message ?? 'Generation failed.'));
      return res.json(serialize(failed));
    }

    const video = operation.response?.generatedVideos?.[0]?.video;
    if (!video) {
      const failed = await fail(job.id, 'The video service returned no clip.');
      return res.json(serialize(failed));
    }

    // Download once, then park it in our own storage — Veo drops the file
    // after ~48h, so the provider URI is never the permanent location.
    const bytes = await readVideoBytes(video);
    if (!bytes) {
      const failed = await fail(job.id, 'The finished video could not be retrieved.');
      return res.json(serialize(failed));
    }

    const storedUrl = await persistVideo(bytes, job.id);

    const ready = await prisma.veoVideoJob.update({
      where: { id: job.id },
      data: {
        status: 'ready',
        // Fall back to the provider URI only when our own storage refused it —
        // a clip that plays for 48h beats one the owner paid for and lost.
        videoUrl: storedUrl ?? String((video as any).uri ?? ''),
        errorMessage: storedUrl ? null : 'Stored temporarily — this clip expires in about two days.',
      },
    });
    return res.json(serialize(ready));
  } catch (err) {
    await reportFailure(err, 'poll');
    return providerError(res, err);
  }
}

// GET /api/video/jobs — this user's recent generations, newest first.
async function listJobs(req: Request, res: Response): Promise<any> {
  const jobs = await prisma.veoVideoJob.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return res.json({ jobs: jobs.map(serialize) });
}

async function fail(id: string, message: string) {
  return prisma.veoVideoJob.update({
    where: { id },
    data: { status: 'failed', errorMessage: message },
  });
}

/** Never expose operationId — it is provider plumbing, not app data. */
function serialize(job: any) {
  return {
    id: job.id,
    status: job.status,
    prompt: job.prompt,
    videoUrl: job.videoUrl,
    durationSecs: job.durationSecs,
    resolution: job.resolution,
    aspectRatio: job.aspectRatio,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
  };
}

const router = Router();
router.post('/generate', middleware.jwtCheck, generate);
router.get('/jobs', middleware.jwtCheck, listJobs);
router.get('/jobs/:id', middleware.jwtCheck, jobStatus);

export default router;

/**
 * Server-side generation for a PRD-defined automatic flow (a scheduler, a
 * post-publish hook). Returns the job id; the caller stores it and polls, or
 * lets the UI poll. NEVER call this on a request path a user is waiting on.
 *
 * Deliberately bypasses the per-user daily cap — an owner-defined automation is
 * not a user hammering a button — but still refuses without a key.
 */
export async function startVideoGeneration(
  userId: number,
  prompt: string,
  opts?: { imageUrl?: string; durationSecs?: number; aspectRatio?: string },
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!apiKey()) return { ok: false, message: 'Google Veo is not configured.' };
  try {
    const operation = await client().models.generateVideos({
      model: MODELS.fast,
      prompt: prompt.slice(0, MAX_PROMPT_CHARS),
      config: {
        durationSeconds: opts?.durationSecs ?? DEFAULT_DURATION,
        resolution: DEFAULT_RESOLUTION,
        aspectRatio: opts?.aspectRatio ?? DEFAULT_ASPECT,
      },
    });
    const job = await prisma.veoVideoJob.create({
      data: {
        userId,
        prompt,
        operationId: operation.name ?? null,
        status: 'pending',
        durationSecs: opts?.durationSecs ?? DEFAULT_DURATION,
        resolution: DEFAULT_RESOLUTION,
        aspectRatio: opts?.aspectRatio ?? DEFAULT_ASPECT,
        model: MODELS.fast,
      },
    });
    return { ok: true, id: job.id };
  } catch (err) {
    console.error('[veo] server-side generation failed:', (err as Error).message);
    await reportFailure(err, 'generate');
    return { ok: false, message: 'Could not start video generation.' };
  }
}
