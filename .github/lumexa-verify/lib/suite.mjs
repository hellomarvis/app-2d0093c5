// Save / restore the frozen test suite through the platform, so a later run
// (after the owner's integrations are installed) repeats the SAME tests.
//   node suite.mjs pack <work-dir> <out.json>
//   node suite.mjs unpack <in.json> <work-dir>     (exit 1 = no usable suite)
// integration-code.spec.ts is generated per run and never saved.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const [mode, a, b] = process.argv.slice(2);
const SPEC = /^[\w.-]+\.spec\.ts$/;
const GENERATED = 'integration-code.spec.ts';

if (mode === 'pack') {
  const files = {};
  const tests = join(a, 'tests.frozen');
  for (const name of existsSync(tests) ? readdirSync(tests) : []) {
    if (SPEC.test(name) && name !== GENERATED) files[`tests/${name}`] = readFileSync(join(tests, name), 'utf8');
  }
  for (const name of ['journeys.md', 'invalid-tests.txt']) {
    if (existsSync(join(a, name))) files[name] = readFileSync(join(a, name), 'utf8');
  }
  writeFileSync(b, JSON.stringify({ files }));
} else if (mode === 'unpack') {
  let files = {};
  try {
    files = JSON.parse(readFileSync(a, 'utf8')).files ?? {};
  } catch {
    process.exit(1);
  }
  const specs = Object.keys(files).filter((p) => p.startsWith('tests/') && SPEC.test(p.slice(6)));
  if (!specs.length) process.exit(1);
  const tests = join(b, 'harness', 'tests');
  rmSync(tests, { recursive: true, force: true });
  mkdirSync(tests, { recursive: true });
  for (const p of specs) writeFileSync(join(tests, p.slice(6)), files[p]);
  for (const name of ['journeys.md', 'invalid-tests.txt']) {
    if (typeof files[name] === 'string') writeFileSync(join(b, name), files[name]);
  }
  console.log(`${specs.length} spec files`);
} else {
  process.exit(2);
}
