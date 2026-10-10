// INTEGRATION KIT — OpenAI (text, chat, embeddings, speech-to-text, image analysis, image generation).
//
// Staged verbatim when the project owner supplies OPENAI_API_KEY. The kit is
// the app's ONLY OpenAI client: app code imports the helpers below into its
// own seams (see backend/src/lib/integrationSeam.ts); the router exists for
// the frontend.
//
// PLATFORM METERING — do not "fix" this: the client is constructed with an
// apiKey and NO explicit baseURL. When the owner chooses the platform's shared
// key instead of their own, the platform injects a proxy token as
// OPENAI_API_KEY plus an OPENAI_BASE_URL pointing at its metering gateway. The
// official SDK reads OPENAI_BASE_URL from the environment on its own, so the
// same code path serves both bring-your-own-key and platform-metered projects.
// Hardcoding https://api.openai.com/v1 here would bypass metering and bill the
// platform for usage it cannot attribute.
import express, { Request, Response, Router } from 'express';
import OpenAI, { toFile } from 'openai';
import middleware from '../../middleware';
// Owner-actionable provider errors are reported to the platform dashboard.
import { errorFieldsFromError, reportIntegrationError } from './integrationSignal';
import config from '../../../config';

const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';
// Image GENERATION. Always returns base64 — there is no hosted URL to fall
// back on, so the result is stored in the app's own media storage below.
const DEFAULT_IMAGE_MODEL = 'gpt-image-1';
const DEFAULT_EMBED_MODEL = 'text-embedding-3-small';
const DEFAULT_TRANSCRIBE_MODEL = 'whisper-1';
// Vision rides on the chat model — gpt-4o-mini reads images natively.
const DEFAULT_VISION_MODEL = 'gpt-4o-mini';
// Whisper accepts up to 25 MB per file; base64 inflates by ~4/3.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
// OpenAI accepts up to 20 MB per image.
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const INTEGRATION = 'OpenAI';
const NOT_CONFIGURED_MESSAGE = 'OpenAI API key is not configured.';

function apiKey(): string {
  return (process.env.OPENAI_API_KEY ?? '').trim();
}

/** True once the owner has supplied OPENAI_API_KEY. Check before calling a helper. */
export function isOpenAIConfigured(): boolean {
  return Boolean(apiKey());
}

/** Thrown by every helper. `message` is user-safe; `status` is the HTTP status to answer with. */
export class OpenAIError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OpenAIError';
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatArgs {
  /** At least one entry. */
  messages: ChatMessage[];
  /** System prompt; omit for none. */
  system?: string;
  /** Omit for the kit's default. */
  model?: string;
  /** Clamped to 1..4096. */
  maxTokens?: number;
}

export interface ChatResult {
  content: string;
  model: string;
  finishReason: string;
}

export interface EmbedArgs {
  input: string | string[];
  model?: string;
}

export interface EmbedResult {
  embeddings: number[][];
  model: string;
}

export interface TranscribeArgs {
  /** Raw audio bytes (mp3, mp4, m4a, wav, webm, ogg, flac). Max 25 MB. */
  audio: Buffer;
  /** File name with extension — Whisper uses it to sniff the format. */
  filename: string;
  /** ISO-639-1 hint, e.g. 'en'. Omit to auto-detect. */
  language?: string;
  /** Omit for the kit's default. */
  model?: string;
}

export interface TranscribeResult {
  text: string;
  model: string;
}

export interface AnalyzeImageArgs {
  /** What to do with the image — describe it, read the receipt, check the product photo. */
  prompt: string;
  /** Raw image bytes (jpeg, png, gif, webp). Max 20 MB. Pass this OR `imageUrl`. */
  image?: Buffer;
  /** MIME type of `image`. Defaults to image/jpeg. */
  mimeType?: string;
  /** Public https URL of the image (e.g. a stored media asset). Pass this OR `image`. */
  imageUrl?: string;
  /** System prompt; omit for none. */
  system?: string;
  /** Omit for the kit's default. */
  model?: string;
  /** Clamped to 1..4096. */
  maxTokens?: number;
  /** 'low' is cheaper and enough for classification; 'high' for reading small text. Default 'auto'. */
  detail?: 'low' | 'high' | 'auto';
}

export type AnalyzeImageResult = ChatResult;

/**
 * Construct LAZILY, per call — never at module top level. A missing key must
 * not crash boot; the router still mounts and its routes answer 503, so adding
 * the key later and redeploying activates the feature with no code change.
 */
function client(): OpenAI {
  return new OpenAI({ apiKey: apiKey() });
}

/** Map SDK failures to a user-safe error. Never leaks the key or the raw error. */
const BUSY_MESSAGE = 'AI is busy right now — please try again shortly.';
const UNAVAILABLE_MESSAGE = 'The AI service is unavailable right now.';
const MODEL_UNAVAILABLE_MESSAGE = "This AI model isn't available. Try again with the default model.";
/** OpenAI 429 codes that mean the account is out of quota, not just busy. */
const QUOTA_CODES = new Set([
  'insufficient_quota',
  'credit_balance_exhausted',
  'organization_spend_limit_exceeded',
  'project_spend_limit_exceeded',
  'organization_usage_limit_exceeded',
]);

type SdkError = { status?: number; message?: string; code?: string; headers?: Record<string, string> };

/**
 * The platform LLM gateway tags every refusal it makes itself (no credits,
 * unpriced model, spend cap) with this header; provider errors never carry
 * it. Read from the headers, never the body, so an unparseable error still
 * maps cleanly.
 */
function gatewayErrorType(err: unknown): string | undefined {
  return (err as SdkError | undefined)?.headers?.['x-lumexa-gateway-error'];
}

/**
 * Status-first mapping; nothing here requires the error body to parse.
 * 503 is reserved for "not configured" (the frontend renders it as a calm
 * not-connected state) and 401 is never returned (the frontend treats it as
 * an expired session).
 */
function toOpenAIError(err: unknown, where: string): OpenAIError {
  const e = (err ?? {}) as SdkError;
  console.error(`[openai] ${where} failed (${e.status ?? 'no response'}):`, e.message);
  switch (gatewayErrorType(err)) {
    case 'insufficient_credits':
      return new OpenAIError(402, 'AI credits have run out. The app owner can add more in Billing.');
    case 'model_not_supported':
      return new OpenAIError(400, MODEL_UNAVAILABLE_MESSAGE);
    case 'per_project_hourly_cap':
    case 'per_project_daily_cap':
      return new OpenAIError(429, 'This app has reached its AI usage limit for now. Please try again later.');
    case 'wallet_concurrency_limit':
      return new OpenAIError(429, BUSY_MESSAGE);
  }
  const status = e.status;
  if (!status) return new OpenAIError(502, "Couldn't reach the AI service. Please try again.");
  if (status === 401 || status === 403) return new OpenAIError(503, NOT_CONFIGURED_MESSAGE);
  if (status === 402) return new OpenAIError(502, 'The AI provider account has a billing problem. The app owner needs to check it.');
  if (status === 429 && e.code && QUOTA_CODES.has(e.code)) {
    return new OpenAIError(502, "The AI provider's usage limit has been reached. The app owner needs to check the account.");
  }
  if (status === 429) return new OpenAIError(429, BUSY_MESSAGE);
  if (status === 404) return new OpenAIError(400, MODEL_UNAVAILABLE_MESSAGE);
  if (status === 400 || status === 413 || status === 422) {
    return new OpenAIError(400, "The AI couldn't process this request. Try shorter text or a smaller file.");
  }
  if (status >= 500) return new OpenAIError(502, 'The AI service is temporarily unavailable. Please try again.');
  return new OpenAIError(502, UNAVAILABLE_MESSAGE);
}

/** Report a failure the provider (or gateway) answered; network errors carry no status and are skipped. */
async function reportFailure(err: unknown, op: string): Promise<void> {
  if ((err as SdkError | undefined)?.status) await reportIntegrationError('openai', op, errorFieldsFromError(err));
}

// ── Text-to-speech — the text-to-speech capability adapter ──────────────────

const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_TTS_VOICE = 'alloy';
const MAX_TTS_CHARS = 4096;

export interface SpeakArgs {
  /** 1..4096 chars. */
  text: string;
  /** An OpenAI voice name (alloy, ash, coral, echo, fable, nova, onyx, sage, shimmer). Omit for the default. */
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

/** MP3 speech for `text`. Reached through the text-to-speech facade. Throws OpenAIError. */
export async function speakText(args: SpeakArgs): Promise<SpeakResult> {
  if (!isOpenAIConfigured()) throw new OpenAIError(503, NOT_CONFIGURED_MESSAGE);
  const text = String(args.text ?? '').trim();
  if (!text) throw new OpenAIError(400, 'text is required');
  if (text.length > MAX_TTS_CHARS) throw new OpenAIError(400, `text must be at most ${MAX_TTS_CHARS} characters`);
  const voice = (args.voice?.trim() || DEFAULT_TTS_VOICE) as 'alloy';
  try {
    const response = await client().audio.speech.create({
      model: DEFAULT_TTS_MODEL,
      voice,
      input: text,
      response_format: 'mp3',
    });
    return {
      audio: Buffer.from(await response.arrayBuffer()),
      contentType: 'audio/mpeg',
      model: DEFAULT_TTS_MODEL,
      voice,
    };
  } catch (err) {
    await reportFailure(err, 'speech');
    throw toOpenAIError(err, 'speech');
  }
}

// ── Web-grounded answers — the web-answers capability adapter ───────────────

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

/** One web-searched answer with its source URLs (Responses API + web search tool). Throws OpenAIError. */
export async function askWeb(args: AskWebArgs): Promise<AskWebResult> {
  if (!isOpenAIConfigured()) throw new OpenAIError(503, NOT_CONFIGURED_MESSAGE);
  const query = String(args.query ?? '').trim();
  if (!query) throw new OpenAIError(400, 'query is required');
  try {
    const response = await client().responses.create({
      model: DEFAULT_CHAT_MODEL,
      tools: [{ type: 'web_search_preview' }],
      input: query,
      ...(args.system ? { instructions: args.system } : {}),
      max_output_tokens: Math.min(Math.max(Number(args.maxTokens) || 1024, 16), 4096),
    });
    const citations = new Set<string>();
    for (const item of response.output ?? []) {
      if (item.type !== 'message') continue;
      for (const part of item.content ?? []) {
        if (part.type !== 'output_text') continue;
        for (const a of part.annotations ?? []) {
          if (a.type === 'url_citation' && a.url) citations.add(a.url);
        }
      }
    }
    return { answer: response.output_text ?? '', citations: [...citations], model: response.model };
  } catch (err) {
    await reportFailure(err, 'web-search');
    throw toOpenAIError(err, 'web-search');
  }
}

// ── Document reading — the doc-read capability adapter ──────────────────────

// File inputs: up to 100 pages / 32 MB per request.
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
// Plain-text documents are inlined into the prompt; keep that bounded.
const MAX_INLINE_TEXT_CHARS = 200_000;

export interface ReadDocumentArgs {
  prompt: string;
  /** The document bytes the app already holds. */
  document: Buffer;
  /** 'application/pdf', an image type (read as a picture), or 'text/*' (inlined). */
  mimeType: string;
  filename?: string;
  system?: string;
  maxTokens?: number;
}

/**
 * Document reading: answer `prompt` about ONE uploaded document. PDFs go in as
 * file parts (the model reads text and page images); page images are read as
 * pictures; plain text is inlined. Throws OpenAIError.
 */
export async function readDocument(args: ReadDocumentArgs): Promise<ChatResult> {
  if (!isOpenAIConfigured()) throw new OpenAIError(503, NOT_CONFIGURED_MESSAGE);
  const prompt = String(args.prompt ?? '').trim();
  if (!prompt) throw new OpenAIError(400, 'prompt is required');
  if (!args.document || args.document.length === 0) throw new OpenAIError(400, 'document is required');
  if (args.document.length > MAX_DOCUMENT_BYTES) throw new OpenAIError(400, 'document must be 32 MB or smaller');
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
    throw new OpenAIError(400, 'document must be a PDF, an image (JPEG/PNG/GIF/WebP) or plain text');
  }

  const filename = (args.filename ?? 'document.pdf').replace(/[^\w.-]+/g, '_');
  try {
    const completion = await client().chat.completions.create({
      model: DEFAULT_CHAT_MODEL,
      max_tokens: Math.min(Math.max(Number(args.maxTokens) || 1024, 1), 4096),
      messages: [
        ...(args.system ? [{ role: 'system' as const, content: args.system }] : []),
        {
          role: 'user' as const,
          content: [
            {
              type: 'file' as const,
              file: { filename, file_data: `data:application/pdf;base64,${args.document.toString('base64')}` },
            },
            { type: 'text' as const, text: prompt },
          ],
        },
      ],
    });
    return {
      content: completion.choices?.[0]?.message?.content ?? '',
      model: completion.model,
      finishReason: completion.choices?.[0]?.finish_reason ?? 'stop',
    };
  } catch (err) {
    if (err instanceof OpenAIError) throw err;
    await reportFailure(err, 'document');
    throw toOpenAIError(err, 'document');
  }
}

// ── Image generation — the image-gen capability adapter ─────────────────────
//
// Same argument and result shape as every other image provider's adapter, so
// the capability facade can re-export any of them unchanged. Reached by app
// code ONLY through backend/src/custom/capabilities/imageGen.ts.

/** Aspect presets shared by every image provider, mapped onto gpt-image-1's fixed sizes. */
export type ImageSize =
  | 'square_hd'
  | 'square'
  | 'portrait_4_3'
  | 'portrait_16_9'
  | 'landscape_4_3'
  | 'landscape_16_9';

const IMAGE_DIMENSIONS: Record<ImageSize, { size: string; width: number; height: number }> = {
  square_hd: { size: '1024x1024', width: 1024, height: 1024 },
  square: { size: '1024x1024', width: 1024, height: 1024 },
  portrait_4_3: { size: '1024x1536', width: 1024, height: 1536 },
  portrait_16_9: { size: '1024x1536', width: 1024, height: 1536 },
  landscape_4_3: { size: '1536x1024', width: 1536, height: 1024 },
  landscape_16_9: { size: '1536x1024', width: 1536, height: 1024 },
};
const MAX_PROMPT_CHARS = 1000;
const MAX_REFERENCE_IMAGES = 4;

export interface GenerateImageArgs {
  /** 1..1000 chars. Describe the subject, the style and the framing. */
  prompt: string;
  /** Aspect preset. Omit for landscape_4_3. */
  imageSize?: ImageSize;
  /** Accepted for shape-compatibility with other providers; gpt-image-1 has no seed. */
  seed?: number;
  /**
   * Reference images the OUTPUT MUST CONTAIN — the user's own photo, the
   * garment, the room, the product. Public http(s) URLs, at most 4. Routes the
   * call to the edit endpoint, which preserves those subjects.
   */
  imageUrls?: string[];
}

export interface GeneratedImage {
  /** The app's OWN permanent URL in the normal case; a data: URL when the project has no upload storage. */
  url: string;
  width: number;
  height: number;
  contentType: string;
  /** Always null for OpenAI — kept for shape-compatibility. */
  seed: number | null;
  model: string;
  /** false → `url` is a data URL (no storage configured); large, but renders. */
  stored: boolean;
}

/**
 * Park the finished image in the project's own storage. Returns null when
 * storage is unconfigured or the proxy refuses it — the caller then falls back
 * to a data URL, because an image the owner already paid for must not be lost.
 */
async function persistImage(bytes: Buffer, contentType: string): Promise<string | null> {
  if (!config.mediaProxyUrl || !config.mediaUploadToken || !config.projectId) {
    console.warn('[openai] upload proxy not configured — returning the image as a data URL');
    return null;
  }
  const extension = contentType === 'image/jpeg' ? 'jpg' : 'png';
  try {
    const resp = await fetch(
      `${config.mediaProxyUrl}/v1/projects/${config.projectId}/uploads?folder=generated`,
      {
        method: 'POST',
        headers: {
          'x-media-upload-token': config.mediaUploadToken,
          'content-type': 'application/octet-stream',
          'x-content-type': contentType,
          'x-filename': `openai-${Date.now()}.${extension}`,
        },
        body: new Uint8Array(bytes),
      },
    );
    const data: any = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('[openai] upload proxy rejected the image:', data?.error ?? resp.status);
      return null;
    }
    return String(data?.url ?? '') || null;
  } catch (err) {
    console.error('[openai] upload proxy unreachable:', (err as Error).message);
    return null;
  }
}

/** Download one public reference image as an SDK upload. */
async function fetchReference(url: string, index: number) {
  if (!/^https?:\/\//i.test(url)) throw new OpenAIError(400, 'imageUrls must be public http(s) URLs');
  const resp = await fetch(url).catch(() => null);
  if (!resp || !resp.ok) {
    throw new OpenAIError(400, 'A reference image could not be fetched — make sure its URL is public.');
  }
  const type = (resp.headers.get('content-type') ?? 'image/png').split(';')[0].trim();
  if (!IMAGE_MIME_TYPES.has(type)) throw new OpenAIError(400, 'Reference images must be JPEG, PNG, GIF or WebP');
  const bytes = Buffer.from(await resp.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new OpenAIError(400, 'Reference images must be 20 MB or smaller');
  return toFile(bytes, `reference-${index}.${type === 'image/jpeg' ? 'jpg' : 'png'}`, { type });
}

/**
 * Generate ONE image (gpt-image-1) and store it at the app's own URL. With
 * `imageUrls` the references are edited rather than described, so the output
 * keeps their subjects. Throws OpenAIError (503 when not configured).
 */
export async function generateImage(args: GenerateImageArgs): Promise<GeneratedImage> {
  if (!isOpenAIConfigured()) throw new OpenAIError(503, NOT_CONFIGURED_MESSAGE);
  const prompt = String(args.prompt ?? '').trim();
  if (!prompt) throw new OpenAIError(400, 'prompt is required');
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new OpenAIError(400, `prompt must be at most ${MAX_PROMPT_CHARS} characters`);
  }
  const refs = (args.imageUrls ?? []).map((u) => String(u ?? '').trim()).filter(Boolean);
  if (refs.length > MAX_REFERENCE_IMAGES) {
    throw new OpenAIError(400, `imageUrls must contain at most ${MAX_REFERENCE_IMAGES} URLs`);
  }
  const dims = IMAGE_DIMENSIONS[args.imageSize ?? 'landscape_4_3'] ?? IMAGE_DIMENSIONS.landscape_4_3;

  let b64: string | undefined;
  try {
    if (refs.length > 0) {
      const files = await Promise.all(refs.map((u, i) => fetchReference(u, i)));
      const edited = await client().images.edit({
        model: DEFAULT_IMAGE_MODEL,
        image: files,
        prompt,
        n: 1,
        // The SDK's size union gained gpt-image-1's dimensions in a later 4.x
        // than the oldest version an app may have pinned; the API accepts them.
        size: dims.size as any,
      });
      b64 = edited.data?.[0]?.b64_json;
    } else {
      const generated = await client().images.generate({
        model: DEFAULT_IMAGE_MODEL,
        prompt,
        n: 1,
        size: dims.size as any,
      });
      b64 = generated.data?.[0]?.b64_json;
    }
  } catch (err) {
    if (err instanceof OpenAIError) throw err;
    await reportFailure(err, 'image');
    throw toOpenAIError(err, 'image');
  }
  if (!b64) throw new OpenAIError(502, 'The image service returned no image. Please try again.');

  const contentType = 'image/png';
  const bytes = Buffer.from(b64, 'base64');
  const storedUrl = await persistImage(bytes, contentType);
  return {
    url: storedUrl ?? `data:${contentType};base64,${b64}`,
    width: dims.width,
    height: dims.height,
    contentType,
    seed: null,
    model: DEFAULT_IMAGE_MODEL,
    stored: storedUrl !== null,
  };
}

/** One chat completion. Throws OpenAIError (503 when not configured, 400 on empty input). */
export async function chatCompletion(args: ChatArgs): Promise<ChatResult> {
  if (!isOpenAIConfigured()) throw new OpenAIError(503, NOT_CONFIGURED_MESSAGE);
  const messages = (args.messages ?? [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: m.content }));
  if (messages.length === 0) throw new OpenAIError(400, 'messages must contain at least one entry');

  try {
    const completion = await client().chat.completions.create({
      model: args.model || DEFAULT_CHAT_MODEL,
      max_tokens: Math.min(Math.max(Number(args.maxTokens) || 1024, 1), 4096),
      messages: args.system ? [{ role: 'system' as const, content: args.system }, ...messages] : messages,
    });
    return {
      content: completion.choices?.[0]?.message?.content ?? '',
      model: completion.model,
      finishReason: completion.choices?.[0]?.finish_reason ?? 'stop',
    };
  } catch (err) {
    await reportFailure(err, 'chat');
    throw toOpenAIError(err, 'chat');
  }
}

/** Embeddings for one or many strings. Throws OpenAIError. */
export async function embedText(args: EmbedArgs): Promise<EmbedResult> {
  if (!isOpenAIConfigured()) throw new OpenAIError(503, NOT_CONFIGURED_MESSAGE);
  const input = (Array.isArray(args.input) ? args.input : [args.input])
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);
  if (input.length === 0) throw new OpenAIError(400, 'input is required');

  try {
    const result = await client().embeddings.create({ model: args.model || DEFAULT_EMBED_MODEL, input });
    return { embeddings: result.data.map((d) => d.embedding), model: result.model };
  } catch (err) {
    await reportFailure(err, 'embed');
    throw toOpenAIError(err, 'embed');
  }
}

/** Speech-to-text for one audio file. Throws OpenAIError (503 when not configured, 400 on empty/oversized audio). */
export async function transcribeAudio(args: TranscribeArgs): Promise<TranscribeResult> {
  if (!isOpenAIConfigured()) throw new OpenAIError(503, NOT_CONFIGURED_MESSAGE);
  if (!args.audio || args.audio.length === 0) throw new OpenAIError(400, 'audio is required');
  if (args.audio.length > MAX_AUDIO_BYTES) throw new OpenAIError(400, 'audio must be 25 MB or smaller');
  const filename = String(args.filename ?? '').trim() || 'audio.webm';
  const model = args.model || DEFAULT_TRANSCRIBE_MODEL;

  try {
    const result = await client().audio.transcriptions.create({
      file: await toFile(args.audio, filename),
      model,
      ...(args.language ? { language: args.language } : {}),
    });
    return { text: result.text ?? '', model };
  } catch (err) {
    await reportFailure(err, 'transcribe');
    throw toOpenAIError(err, 'transcribe');
  }
}

/**
 * Resolve the image input to what the chat API accepts: a data URL for bytes,
 * the URL itself for a hosted image. Throws OpenAIError(400) on bad input.
 */
function imageInputUrl(args: AnalyzeImageArgs): string {
  const hasBytes = Boolean(args.image && args.image.length > 0);
  const url = String(args.imageUrl ?? '').trim();
  if (hasBytes && url) throw new OpenAIError(400, 'pass either image or imageUrl, not both');
  if (hasBytes) {
    if (args.image!.length > MAX_IMAGE_BYTES) throw new OpenAIError(400, 'image must be 20 MB or smaller');
    const mime = String(args.mimeType ?? '').split(';')[0].trim().toLowerCase() || 'image/jpeg';
    if (!IMAGE_MIME_TYPES.has(mime)) throw new OpenAIError(400, 'image must be JPEG, PNG, GIF or WebP');
    return `data:${mime};base64,${args.image!.toString('base64')}`;
  }
  if (!url) throw new OpenAIError(400, 'image or imageUrl is required');
  if (!/^https?:\/\//i.test(url)) throw new OpenAIError(400, 'imageUrl must be an http(s) URL');
  return url;
}

/** Vision: ask the model about one image. Throws OpenAIError (503 when not configured, 400 on bad input). */
export async function analyzeImage(args: AnalyzeImageArgs): Promise<AnalyzeImageResult> {
  if (!isOpenAIConfigured()) throw new OpenAIError(503, NOT_CONFIGURED_MESSAGE);
  const prompt = String(args.prompt ?? '').trim();
  if (!prompt) throw new OpenAIError(400, 'prompt is required');
  const imageUrl = imageInputUrl(args);
  const detail: 'low' | 'high' | 'auto' = args.detail === 'low' || args.detail === 'high' ? args.detail : 'auto';

  // Typed against the SDK's param type: an untyped literal widens `detail` to
  // string and the create() overloads stop matching.
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    ...(args.system ? [{ role: 'system' as const, content: args.system }] : []),
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl, detail } },
      ],
    },
  ];
  try {
    const completion = await client().chat.completions.create({
      model: args.model || DEFAULT_VISION_MODEL,
      max_tokens: Math.min(Math.max(Number(args.maxTokens) || 1024, 1), 4096),
      messages,
    });
    return {
      content: completion.choices?.[0]?.message?.content ?? '',
      model: completion.model,
      finishReason: completion.choices?.[0]?.finish_reason ?? 'stop',
    };
  } catch (err) {
    await reportFailure(err, 'vision');
    // Upstream 400 here is almost always the IMAGE, not the request: a URL
    // OpenAI's fetcher cannot download (private bucket, hotlink-protected
    // host, expired signed URL) or bytes that are not a decodable image. That
    // is the caller's input, so answer 400 with a hint instead of the generic
    // 502 — seen live: a Wikimedia URL the model fetcher was refused for.
    if ((err as { status?: number }).status === 400 && !gatewayErrorType(err)) {
      console.error('[openai] vision rejected the image:', (err as Error).message);
      throw new OpenAIError(400, 'The image could not be read — make sure the URL is public and the file is a valid JPEG, PNG, GIF or WebP.');
    }
    throw toOpenAIError(err, 'vision');
  }
}

// ── HTTP surface — thin shells over the helpers ─────────────────────────────

function sendError(res: Response, err: unknown): Response {
  if (err instanceof OpenAIError) {
    if (err.status === 503) {
      return res.status(503).json({ error: 'integration_not_configured', integration: INTEGRATION, message: err.message });
    }
    return res.status(err.status).json({ message: err.message });
  }
  console.error('[openai] unexpected error:', err);
  return res.status(502).json({ message: UNAVAILABLE_MESSAGE });
}

// POST /api/ai/chat — { messages: [{role, content}], system?, model?, maxTokens? }
async function chat(req: Request, res: Response): Promise<any> {
  const body = (req.body ?? {}) as Partial<ChatArgs>;
  try {
    return res.json(
      await chatCompletion({
        messages: body.messages ?? [],
        system: body.system,
        model: body.model,
        maxTokens: body.maxTokens,
      }),
    );
  } catch (err) {
    return sendError(res, err);
  }
}

// POST /api/ai/embed — { input: string | string[], model? }
async function embed(req: Request, res: Response): Promise<any> {
  const body = (req.body ?? {}) as Partial<EmbedArgs>;
  try {
    return res.json(await embedText({ input: body.input ?? '', model: body.model }));
  } catch (err) {
    return sendError(res, err);
  }
}

// POST /api/ai/transcribe — { audioBase64: string, filename?: string, language?: string, model?: string }
async function transcribe(req: Request, res: Response): Promise<any> {
  const body = (req.body ?? {}) as { audioBase64?: string; filename?: string; language?: string; model?: string };
  try {
    const audio = Buffer.from(String(body.audioBase64 ?? ''), 'base64');
    return res.json(
      await transcribeAudio({ audio, filename: body.filename ?? 'audio.webm', language: body.language, model: body.model }),
    );
  } catch (err) {
    return sendError(res, err);
  }
}

// POST /api/ai/analyze-image — { prompt, imageBase64?, mimeType?, imageUrl?, system?, model?, maxTokens?, detail? }
async function analyze(req: Request, res: Response): Promise<any> {
  const body = (req.body ?? {}) as Partial<AnalyzeImageArgs> & { imageBase64?: string };
  try {
    const imageBase64 = String(body.imageBase64 ?? '').trim();
    return res.json(
      await analyzeImage({
        prompt: body.prompt ?? '',
        ...(imageBase64 ? { image: Buffer.from(imageBase64, 'base64'), mimeType: body.mimeType } : {}),
        imageUrl: body.imageUrl,
        system: body.system,
        model: body.model,
        maxTokens: body.maxTokens,
        detail: body.detail,
      }),
    );
  } catch (err) {
    return sendError(res, err);
  }
}

const router = Router();
// Authenticated: AI calls cost the owner real money, so they are not open to
// anonymous traffic. Drop jwtCheck only if the product genuinely needs a public
// AI surface, and add your own rate limiting if you do.
router.post('/chat', middleware.jwtCheck, chat);
router.post('/embed', middleware.jwtCheck, embed);
export default router;

/**
 * Transcription is mounted BEFORE the app's global express.json() (default
 * 100 kB limit) so a base64 audio body can reach it; the router carries its
 * own 34 MB parser (25 MB of audio, base64-inflated). The global parser skips
 * a body that is already parsed.
 */
export const transcribeRouter = Router();
transcribeRouter.use(express.json({ limit: '34mb' }));
transcribeRouter.post('/', middleware.jwtCheck, transcribe);

/**
 * Same reason as transcription: a base64 image body (20 MB, base64-inflated
 * to ~27 MB) would be rejected by the global 100 kB parser, so this router
 * mounts before it with its own limit. URL-only calls are tiny and fine either way.
 */
export const analyzeImageRouter = Router();
analyzeImageRouter.use(express.json({ limit: '28mb' }));
analyzeImageRouter.post('/', middleware.jwtCheck, analyze);
