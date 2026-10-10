// Enforce the fix contract on the working tree, run from the repo root:
//   node guard-diff.mjs  → prints {"sourceChanged": n, "restored": [...]}
// Deleted/renamed files are restored and platform-owned files are reverted —
// the platform refuses fixes that touch either (src/services/e2eVerify/fix.ts
// keeps the same list), so undoing them here keeps a fix shippable.
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';

const PROTECTED = [
  /^\.github\//,
  /^\.gitignore$/,
  /^metadata\.json$/,
  /^buildspec\.yml$/,
  /^docker-compose\.yml$/,
  /(^|\/)Dockerfile(\.[a-z]+)?$/,
  /(^|\/)package\.json$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /^backend\/bootstrap\.js$/,
  /^backend\/config\/index\.ts$/,
  /^backend\/src\/lib\/prisma\.ts$/,
  /^backend\/src\/lib\/integrationSeam\.ts$/,
  /^backend\/prisma\//,
  /^frontend\/\.env/,
  /^design-kit\//,
  /^\.playwright-mcp\//,
];
const BUILT_OUTPUT = /^backend\/public\//;
// Integration kit files (exact paths, one per line) — pre-written provider code
// the platform installed; applyFix refuses a fix that touches them.
const KIT_FILES = new Set(
  process.env.PROTECTED_EXTRA && existsSync(process.env.PROTECTED_EXTRA)
    ? readFileSync(process.env.PROTECTED_EXTRA, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
    : [],
);

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const entries = git('status', '--porcelain=v1', '-z', '--untracked-files=all')
  .split('\0')
  .filter(Boolean)
  .map((line) => ({ code: line.slice(0, 2), path: line.slice(3) }));

const restored = [];
let sourceChanged = 0;
for (const { code, path } of entries) {
  const untracked = code === '??';
  const deleted = code.includes('D');
  if (BUILT_OUTPUT.test(path)) continue;
  if (deleted) {
    git('checkout', 'HEAD', '--', path);
    restored.push(`${path} (deleted)`);
    continue;
  }
  if (KIT_FILES.has(path) || PROTECTED.some((re) => re.test(path))) {
    if (untracked) rmSync(path, { force: true, recursive: true });
    else git('checkout', 'HEAD', '--', path);
    restored.push(`${path} (protected)`);
    continue;
  }
  sourceChanged++;
}
console.log(JSON.stringify({ sourceChanged, restored }));
