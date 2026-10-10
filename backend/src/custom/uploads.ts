// CUSTOM (non-CRUD) — image uploads for ANY authenticated user.
// Hand-written; never touched by the CRUD compiler.
//
// Any logged-in user can upload (avatars, listing/gallery photos, etc.) — not
// admin-only — so user-generated-content apps work. Uploading is harmless on its
// own (15MB cap here, scoped to the project's S3 namespace); the CRUD routes
// still authorize WHERE the returned URL may be attached.
//
// The platform proxy decides what may be STORED: images, video/mp4, and
// audio/mpeg (an AI speech kit parks generated MP3s here). This route forwards
// whatever content-type it receives and lets the proxy reject the rest. If a specific
// app wants uploads restricted to admins, add `middleware.requireAdmin` below.
//
// The app holds NO AWS credentials. The UI POSTs the raw image bytes here; we
// forward them to the platform upload proxy (which writes to S3 under the
// project's namespace with the platform's own creds) and return the public URL.
import { Request, Response, Router } from 'express';
import express from 'express';
import config from '../../config';
import middleware from '../middleware';

const MAX_BYTES = 15 * 1024 * 1024; // 15MB

// POST /api/uploads — body is the raw image bytes (Content-Type = the image's
// mime). Returns { publicUrl, key } pointing at the stored S3 object.
async function upload(req: Request, res: Response): Promise<any> {
  if (!config.mediaProxyUrl || !config.mediaUploadToken || !config.projectId) {
    return res.status(503).json({ message: 'Image uploads are not configured' });
  }

  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  if (body.length > MAX_BYTES) {
    return res.status(413).json({ message: 'Image too large (max 15MB)' });
  }

  const contentType = String(req.headers['content-type'] || 'application/octet-stream');
  const filename = String(req.headers['x-filename'] || 'image');

  try {
    const resp = await fetch(`${config.mediaProxyUrl}/v1/projects/${config.projectId}/uploads`, {
      method: 'POST',
      headers: {
        'x-media-upload-token': config.mediaUploadToken,
        'content-type': 'application/octet-stream',
        'x-content-type': contentType,
        'x-filename': filename,
      },
      body: new Uint8Array(body),
    });
    const data: any = await resp.json().catch(() => null);
    if (!resp.ok) {
      const status = resp.status >= 500 ? 502 : resp.status;
      return res.status(status).json({ message: data?.error || data?.message || 'Upload failed' });
    }
    return res.status(200).json({ publicUrl: data.url, key: data.key });
  } catch (err) {
    console.error('[uploads] proxy error:', err);
    return res.status(502).json({ message: 'Failed to upload image' });
  }
}

const router = Router();
// Raw body — accept any content type as a Buffer (the admin UI sends the file
// directly). express.json() upstream only parses application/json, so it leaves
// image bodies untouched for this parser.
router.post('/', middleware.jwtCheck,
  express.raw({ type: () => true, limit: MAX_BYTES }), upload);
export default router;
