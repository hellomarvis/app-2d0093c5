// Summarize a Playwright JSON report.
//   node summarize.mjs <results.json> <invalid-tests.txt> <out-summary.json> <out-failures.md>
// Tests listed in invalid-tests.txt (one id per line — marked by the fixer as
// wrong about the PRD, not the app) are left out of every count.
// A `<results>-confirm.json` next to the report (the failing tests run a second
// time, see run_tests) is merged in: a test that passed there is flaky, not
// failed — only failures that repeat reach the fixer.
import { readFileSync, writeFileSync, existsSync } from 'fs';

const [resultsPath, invalidPath, outJson, outMd] = process.argv.slice(2);

let report = null;
try {
  report = JSON.parse(readFileSync(resultsPath, 'utf8'));
} catch {
  report = null;
}
const invalid = new Set(
  existsSync(invalidPath)
    ? readFileSync(invalidPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
    : [],
);

function collect(rep) {
const cases = [];
function walk(suite, titles) {
  const here = suite.title && !suite.title.endsWith('.ts') ? [...titles, suite.title] : titles;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const project = test.projectName || 'default';
      const id = `${spec.file} › ${[...here, spec.title].join(' › ')} [${project}]`;
      if (test.status === 'skipped') continue;
      const last = (test.results ?? [])[test.results.length - 1] ?? {};
      const err = (last.errors ?? [last.error]).filter(Boolean).map((e) => e.message ?? String(e)).join('\n');
      const attachments = (last.attachments ?? []).filter((a) => a.path).map((a) => a.path);
      cases.push({ id, file: spec.file, title: [...here, spec.title].join(' › '), project, status: test.status, error: err, attachments });
    }
  }
  for (const child of suite.suites ?? []) walk(child, here);
}
for (const s of rep?.suites ?? []) walk(s, []);
return cases;
}
const cases = collect(report);

const confirmPath = resultsPath.replace(/\.json$/, '-confirm.json');
if (report && existsSync(confirmPath)) {
  let confirm = null;
  try {
    confirm = JSON.parse(readFileSync(confirmPath, 'utf8'));
  } catch {
    confirm = null;
  }
  const second = new Map(collect(confirm).map((c) => [c.id, c]));
  for (const c of cases) {
    const again = second.get(c.id);
    if (c.status !== 'unexpected' || !again) continue;
    if (again.status === 'unexpected') {
      // The second run's screenshots/traces replaced the first run's on disk.
      c.error = again.error;
      c.attachments = again.attachments;
    } else {
      c.status = 'flaky';
    }
  }
}

const counted = cases.filter((c) => !invalid.has(c.id));
const failures = counted.filter((c) => c.status === 'unexpected');
const summary = {
  reportOk: !!report,
  total: counted.length,
  passed: counted.filter((c) => c.status === 'expected' || c.status === 'flaky').length,
  flaky: counted.filter((c) => c.status === 'flaky').length,
  failed: failures.length,
  excludedAsInvalid: cases.length - counted.length,
  passedIds: counted.filter((c) => c.status !== 'unexpected').map((c) => c.id),
  failedIds: failures.map((c) => c.id),
  invalidIds: cases.filter((c) => invalid.has(c.id)).map((c) => c.id),
  failures: failures.map((c) => ({ id: c.id, error: c.error.slice(0, 1500) })),
};
writeFileSync(outJson, JSON.stringify(summary, null, 2));

const strip = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');
const md = [
  `# Failing tests (${failures.length} of ${counted.length})`,
  '',
  ...failures.flatMap((c) => [
    `## ${c.id}`,
    '',
    '```',
    strip(c.error).slice(0, 3000),
    '```',
    c.attachments.length ? `Artifacts: ${c.attachments.join(', ')}` : '',
    '',
  ]),
].join('\n');
writeFileSync(outMd, md);
console.log(`tests: ${summary.total} counted, ${summary.passed} passed (${summary.flaky} flaky), ${summary.failed} failed, ${summary.excludedAsInvalid} excluded`);
