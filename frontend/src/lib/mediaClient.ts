// mediaClient — image uploads for admin/CRUD UI.
//
// Uploads go to the app's OWN backend at `/api/uploads`, which forwards to the
// platform upload proxy. Same-origin — no CORS — and the app holds no AWS creds.
//
// IMPORTANT: never call the platform media API
// (`https://api.<host>/v1/projects/<id>/media/upload`) from the browser — that is
// cross-origin and gets blocked by CORS.

import { SESSION_EXPIRED_MESSAGE, endSession, getToken } from "./session";

// Bracket access: env comes from Vite's index signature
// (noPropertyAccessFromIndexSignature is on in the boilerplate tsconfig).
const API_URL = (import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/+$/, "") ?? "";

export interface MediaAsset {
  id: string;
  slot: string | null;
  /** Absolute public URL (used directly as <img src>). */
  s3Key: string;
  originalName: string;
  mimeType: string;
}

export function mediaConfigured(): boolean {
  // The app's own /api/uploads is always available.
  return true;
}

/** Stored values are already absolute URLs — return as-is. */
export function mediaUrl(value: string | undefined | null): string {
  return value ?? "";
}

function authHeaders(): Record<string, string> {
  const token = typeof localStorage !== "undefined" ? getToken() : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Listing the project's media library is a platform endpoint, which the browser
 * cannot reach cross-origin. Images are added by uploading, which returns a URL.
 */
export async function listMedia(): Promise<MediaAsset[]> {
  return [];
}

/**
 * Upload an image via the app's own backend (`/api/uploads` → platform
 * upload proxy). Same-origin, so no CORS. Requires an admin session
 * (Authorization: Bearer <auth_token>).
 */
export async function uploadMedia(file: File): Promise<MediaAsset> {
  const res = await fetch(`${API_URL}/api/uploads`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-filename": encodeURIComponent(file.name),
      ...authHeaders(),
    },
    body: file,
  });
  if (!res.ok) {
    // Token rejected: sign out so the app lands on /login instead of leaving
    // the user clicking around a dead session.
    if (res.status === 401) {
      endSession();
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    const msg = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status})${msg ? `: ${msg}` : ""}`);
  }
  const body = (await res.json()) as { publicUrl: string; key: string };
  return {
    id: body.key,
    slot: null,
    s3Key: body.publicUrl,
    originalName: file.name,
    mimeType: file.type,
  };
}
