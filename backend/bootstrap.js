/**
 * bootstrap.js — Conditionally pulls patched source from S3 before app start.
 *
 * When APP_HOT_SOURCE_PREFIX is set (by the modify flow), downloads compiled
 * dist/, public/, and prisma/ from S3, overwriting the baked-in copies.
 * When the env var is absent (initial build, normal restarts), exits immediately.
 *
 * This file is plain JS (not TS) so it can run directly without compilation.
 */
'use strict';

const hotPrefix = process.env.APP_HOT_SOURCE_PREFIX;
const bucket    = process.env.APP_S3_BUCKET;

if (!hotPrefix || !bucket) {
  // No hot source configured — normal startup, nothing to do.
  process.exit(0);
}

const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { writeFileSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');

// Directories to sync from the S3 workspace into the container's /app.
// S3 layout: {hotPrefix}/backend/dist/...  →  /app/dist/...
// S3 layout: {hotPrefix}/backend/public/...  →  /app/public/...
// S3 layout: {hotPrefix}/backend/prisma/...  →  /app/prisma/...
const SYNC_DIRS = ['backend/dist', 'backend/public', 'backend/prisma'];
const APP_DIR = '/app';

async function syncDir(client, s3Dir) {
  const prefix = `${hotPrefix}/${s3Dir}/`;
  // Strip "backend/" to get the local directory relative to /app
  const localBase = s3Dir.replace(/^backend\//, '');
  let fileCount = 0;
  let continuationToken;

  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));

    for (const obj of res.Contents || []) {
      const relPath = obj.Key.slice(prefix.length);
      if (!relPath || obj.Key.endsWith('/')) continue;

      const localPath = join(APP_DIR, localBase, relPath);
      mkdirSync(dirname(localPath), { recursive: true });

      const getRes = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: obj.Key,
      }));

      const chunks = [];
      for await (const chunk of getRes.Body) {
        chunks.push(chunk);
      }
      writeFileSync(localPath, Buffer.concat(chunks));
      fileCount++;
    }

    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  return fileCount;
}

async function main() {
  console.log(`[bootstrap] Hot source enabled — syncing from s3://${bucket}/${hotPrefix}`);
  const client = new S3Client({});
  let totalFiles = 0;

  for (const dir of SYNC_DIRS) {
    const count = await syncDir(client, dir);
    if (count > 0) {
      console.log(`[bootstrap] Synced ${dir} (${count} files)`);
    }
    totalFiles += count;
  }

  console.log(`[bootstrap] Hot source sync complete — ${totalFiles} files updated`);
}

main().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('[bootstrap] Failed to sync hot source:', err.message);
  process.exit(1);
});
