// Integration error signal — staged beside every kit (see kit/shared.ts).
//
// When a provider call fails with something the APP OWNER has to act on (out of
// credits, quota used up, a revoked key), the owner never sees this app's logs.
// Every kit's error path hands the provider's raw error fields to
// reportIntegrationError(); this module sends them to the platform API, which
// classifies them (the rules live in @curs/integrations, not here, so a
// classification fix never needs every app rebuilt) and shows a warning on the
// integration in the owner's dashboard.
//
// The deploy bakes in PLATFORM_SIGNAL_URL (this project's report endpoint on the
// platform API of the SAME environment) and INTEGRATION_SIGNAL_KEY. The key
// never leaves the app: each report is signed over `${timestamp}.${body}` and
// the platform re-derives the key to check it.
//
// Guarantees, because this runs inside a user's request:
//   - never throws, never blocks longer than SEND_TIMEOUT_MS;
//   - a no-op when the platform env is absent (local dev, older deploys);
//   - the same provider error is sent at most once per DEDUPE_MS per instance.
// Callers AWAIT it before responding: on serverless the instance freezes as soon
// as the response is sent, and an un-awaited request would never leave.
//
// Only error metadata leaves the app — status, provider codes and the provider's
// message with URLs and emails stripped. Never request bodies, prompts, user
// data, or keys.
import { createHmac } from 'crypto';

export interface ProviderErrorFields {
  /** HTTP status of the provider response (absent on network failures). */
  status?: number;
  /** Provider error code: error.code, detail.code, error-type, extensions.code, Slack `error`. */
  code?: string;
  /** Provider error type: error.type, Google gRPC status (RESOURCE_EXHAUSTED), problem `type`, title. */
  type?: string;
  /** Google `errors[].reason` / ErrorInfo reason, Maps `status`. */
  reason?: string;
  /** Meta error_subcode, Anthropic details.error_code. */
  subcode?: string;
  /** HubSpot policyName, Stripe-Rate-Limited-Reason. */
  policy?: string;
  /** The provider's own message (trimmed). */
  message?: string;
  /** Value of the platform LLM gateway's x-lumexa-gateway-error header. */
  gateway?: string;
}

const SEND_TIMEOUT_MS = 2000;
const DEDUPE_MS = 10 * 60 * 1000;
const MESSAGE_MAX = 500;
/** Statuses that can carry an owner-actionable provider error. 5xx and network failures are the provider's problem. */
const REPORTABLE_STATUSES = new Set([400, 401, 402, 403, 429]);

const lastSent = new Map<string, number>();

/**
 * Provider messages can echo the request — a 400 quoting a presigned URL or a
 * customer's email. Only the shape of the problem leaves the app.
 */
const redact = (m: string): string =>
  m.replace(/https?:\/\/\S+/g, '<url>').replace(/[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g, '<email>').slice(0, MESSAGE_MAX);

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined;

const obj = (v: unknown): Record<string, any> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : undefined;

function header(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  const h = headers as { get?: (n: string) => string | null } & Record<string, unknown>;
  if (typeof h.get === 'function') return str(h.get(name));
  return str(h[name] ?? h[name.toLowerCase()]);
}

/**
 * Pull the provider's error fields out of a parsed (or raw text) error body.
 * Covers every shape the kits meet: `{error:{…}}` (OpenAI, Anthropic, Google,
 * Meta, TikTok), `{error:"code"}` (Slack, OAuth), `{detail:{…}}` (ElevenLabs),
 * `{errors:[…]}` (SendGrid, monday, X legacy), RFC 7807 problems (X, Calendly),
 * `{"error-type"}` (ExchangeRate-API), `{status, error_message}` (Google Maps)
 * and HubSpot's `{policyName, message}`.
 */
export function errorFieldsFromBody(status: number | undefined, body: unknown, headers?: unknown): ProviderErrorFields {
  let b: unknown = body;
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b);
    } catch {
      return { status, message: str(b) && redact(str(b)!) };
    }
  }
  const root = obj(b) ?? {};
  const out: ProviderErrorFields = { status };

  const err = obj(root.error);
  if (err) {
    // A numeric error.code is Google's echo of the HTTP status, or Meta's own error code (190, 4, …).
    if (typeof err.code === 'number' && (out.status === undefined || err.code === out.status)) out.status ??= err.code;
    else out.code = str(err.code);
    // Google: the gRPC status (RESOURCE_EXHAUSTED) is the broad type; errors[].reason the specific one.
    out.type = str(err.type) ?? str(err.status);
    out.reason = str(err.errors?.[0]?.reason) ?? str(err.details?.[0]?.reason);
    out.subcode = str(err.error_subcode) ?? str(err.details?.error_code);
    out.message = str(err.message) ?? str(err.error_user_msg);
  } else if (typeof root.error === 'string') {
    out.code = root.error;
    out.message = str(root.error_description);
  }

  const detail = obj(root.detail);
  if (detail) {
    out.code ??= str(detail.code) ?? str(detail.status);
    out.type ??= str(detail.type);
    out.message ??= str(detail.message);
  } else {
    out.message ??= str(root.detail);
  }

  const first = obj(Array.isArray(root.errors) ? root.errors[0] : undefined);
  if (first) {
    out.code ??= str(first.extensions?.code) ?? str(first.code);
    out.reason ??= str(first.reason);
    out.message ??= str(first.message);
  }

  out.code ??= str(root['error-type']) ?? str(root.error_code);
  out.type ??= str(root.type) ?? str(root.title) ?? str(root.errorType);
  out.reason ??= typeof root.status === 'string' ? root.status : undefined;
  out.policy = str(root.policyName) ?? header(headers, 'stripe-rate-limited-reason');
  out.message ??= str(root.error_message) ?? str(root.message);
  out.gateway = header(headers, 'x-lumexa-gateway-error');
  if (out.message) out.message = redact(out.message);
  return out;
}

/**
 * Fields from a thrown SDK error (openai, @anthropic-ai/sdk, stripe, googleapis,
 * @google/genai) — each exposes the status and the parsed body under a
 * different name.
 */
export function errorFieldsFromError(err: unknown): ProviderErrorFields {
  const e = (obj(err) ?? {}) as Record<string, any>;
  const status = [e.status, e.statusCode, e.response?.status, e.code].find((v): v is number => typeof v === 'number');
  const headers = e.headers ?? e.response?.headers;
  // @google/genai puts the provider's JSON body in the message itself.
  const body = e.error ?? e.raw ?? e.response?.data ?? (typeof e.message === 'string' && e.message.trim().startsWith('{') ? e.message : undefined);

  let fields: ProviderErrorFields = { status };
  if (body !== undefined) {
    // SDKs keep either the whole response body ({error:{…}}) or only its `error` member (openai, stripe `raw`).
    const b = typeof body === 'string' ? body : obj(body);
    const whole = typeof b === 'string' || (b && (b.error !== undefined || b.detail !== undefined || b.errors !== undefined));
    fields = errorFieldsFromBody(status, whole ? b : { error: body }, headers);
  }
  fields.code ??= typeof e.code === 'string' ? e.code : undefined;
  fields.type ??= str(e.type);
  fields.message ??= str(e.message) && redact(str(e.message)!);
  fields.policy ??= header(headers, 'stripe-rate-limited-reason');
  fields.gateway ??= header(headers, 'x-lumexa-gateway-error');
  return fields;
}

function isReportable(f: ProviderErrorFields): boolean {
  if (f.gateway) return true;
  if (f.status === undefined) return false; // no provider response (network, Prisma, fs) — never a provider issue
  if (REPORTABLE_STATUSES.has(f.status)) return true;
  // Providers that signal in the body — 200-with-error (Google Maps, Slack, monday) or an
  // undocumented 4xx (ExchangeRate-API) — carry a provider code instead.
  return (f.status === 200 || (f.status >= 400 && f.status < 500)) && Boolean(f.code || f.reason);
}

/**
 * Tell the platform this app's integration failed. Await it before responding;
 * it resolves in at most SEND_TIMEOUT_MS and never rejects.
 */
export async function reportIntegrationError(provider: string, op: string, fields: ProviderErrorFields): Promise<void> {
  try {
    const url = process.env.PLATFORM_SIGNAL_URL;
    const key = process.env.INTEGRATION_SIGNAL_KEY;
    if (!url || !key || !isReportable(fields)) return;

    const dedupeKey = [provider, fields.status, fields.code, fields.type, fields.reason, fields.subcode, fields.policy, fields.gateway].join('|');
    const now = Date.now();
    if (now - (lastSent.get(dedupeKey) ?? 0) < DEDUPE_MS) return;
    lastSent.set(dedupeKey, now);

    const body = JSON.stringify({ provider, op, ...fields });
    const timestamp = String(now);
    await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-signal-timestamp': timestamp,
        'x-signal-signature': createHmac('sha256', key).update(`${timestamp}.${body}`).digest('hex'),
      },
      body,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch {
    // The signal is best-effort; the caller's own error handling is unaffected.
  }
}
