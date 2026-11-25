'use strict';

// Unified verification gate (wave 4, item 1).
//
// One command answers "is this repository green?":
//   npm run verify        quick tier: wiring guard + syntax + every
//                         validate-*.cjs in scripts/ + the full node test
//                         suite (which includes the data-fault fixtures).
//   npm run verify:full   quick tier + the Playwright browser smoke
//                         (scripts/browser-pwa-smoke.cjs). The smoke needs an
//                         externally installed Playwright and a local server
//                         on :4173; when Playwright is unavailable it is
//                         reported as "skipped", matching the test suite's
//                         own policy, never as a pass.
//
// The wiring guard compares the explicit VALIDATE_SCRIPTS manifest below
// against the validate-*.cjs files actually present in scripts/. Adding a
// validator without wiring it here turns verify red — a validator that is
// not part of the gate is not a gate. This gate exists because two penny
// validators (validate-storage-recovery, validate-readability) previously
// existed but were wired into no npm entry at all, so whether they ran
// depended on someone remembering to invoke them by name.
//
// Scope note: .github/scripts/validate-question-bank.cjs lives outside
// scripts/ and runs in CI workflows only; it is deliberately not part of
// this local gate's manifest.
//
// Every run writes a machine-readable summary to artifacts/verify-report.json
// ({name, status, durationMs} per step) for downstream consumers such as the
// release reconciliation ledger (wave 4, item 3). The report also carries a
// git field ({head, dirty, source}, see scripts/verify-git-info.cjs) naming
// the exact code version the verdict applies to, so reconciliation matches
// on the recorded head instead of inferring it from timestamps. Exit code
// is 0 only when no step failed.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveGitInfo } = require('./verify-git-info.cjs');

const root = path.resolve(__dirname, '..');
const scriptsDir = path.join(root, 'scripts');
const reportPath = path.join(root, 'artifacts', 'verify-report.json');
const full = process.argv.includes('--full');

// Explicit wiring manifest. Keep sorted; the guard enforces that this list
// is exactly the set of validate-*.cjs files in scripts/.
const VALIDATE_SCRIPTS = [
  'validate-child-pool.cjs',
  'validate-nasa-exoplanet-source.cjs',
  'validate-pwa.cjs',
  'validate-question-evidence-timestamps.cjs',
  'validate-question-evidence.cjs',
  'validate-question-grading.cjs',
  'validate-readability.cjs',
  'validate-review-recheck.cjs',
  'validate-storage-recovery.cjs'
];

function runStep(name, command, args) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 600000
  });
  const durationMs = Date.now() - started;
  const status = result.status === 0 ? 'passed' : 'failed';
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(`[verify] ${name}: ${result.error.message}`);
  console.log(`[verify] ${name}: ${status} (${durationMs} ms)`);
  return { name, status, durationMs };
}

const steps = [];

// 1. Wiring guard: manifest vs files on disk.
{
  const started = Date.now();
  const onDisk = fs.readdirSync(scriptsDir)
    .filter(name => /^validate-.*\.cjs$/.test(name))
    .sort();
  const manifest = [...VALIDATE_SCRIPTS].sort();
  const missing = onDisk.filter(name => !manifest.includes(name));
  const stale = manifest.filter(name => !onDisk.includes(name));
  let status = 'passed';
  if (missing.length || stale.length) {
    status = 'failed';
    if (missing.length) {
      console.error('[verify] validate scripts present but NOT wired into verify: ' + missing.join(', '));
    }
    if (stale.length) {
      console.error('[verify] validate scripts wired into verify but missing on disk: ' + stale.join(', '));
    }
  }
  const durationMs = Date.now() - started;
  console.log(`[verify] validate-wiring: ${status} (${durationMs} ms)`);
  steps.push({ name: 'validate-wiring', status, durationMs });
}

// 2. Syntax gate.
steps.push(runStep('syntax', process.execPath, ['scripts/check-js-syntax.cjs']));

// 3. Every wired validator.
for (const script of VALIDATE_SCRIPTS) {
  steps.push(runStep(script.replace(/\.cjs$/, ''), process.execPath, [path.join('scripts', script)]));
}

// 4. Full test suite (domain, browser smoke tests with graceful skip,
//    data-fault fixtures).
steps.push(runStep('unit-tests', process.execPath, ['--test']));

// 5. Full tier only: Playwright browser smoke, skipped (not passed) when
//    Playwright is not installed in the environment.
if (full) {
  let playwrightAvailable = true;
  try {
    require.resolve('playwright', { paths: [root] });
  } catch {
    playwrightAvailable = false;
  }
  if (!playwrightAvailable) {
    console.log('[verify] browser-smoke: skipped (playwright not installed in this environment)');
    steps.push({ name: 'browser-smoke', status: 'skipped', durationMs: 0 });
  } else {
    steps.push(runStep('browser-smoke', process.execPath, ['scripts/browser-pwa-smoke.cjs']));
  }
}

const failed = steps.filter(step => step.status === 'failed');
const git = resolveGitInfo({ cwd: root });
console.log(`[verify] git: source=${git.source} head=${git.head === null ? 'null' : git.head} ` +
  `dirty=${git.dirty === null ? 'unknown' : git.dirty}`);
const report = {
  gate: 'verify',
  tier: full ? 'full' : 'quick',
  generatedAt: new Date().toISOString(),
  git,
  ok: failed.length === 0,
  steps
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

console.log(`[verify] ${report.ok ? 'GREEN' : 'RED'}: ${steps.filter(s => s.status === 'passed').length} passed, ` +
  `${failed.length} failed, ${steps.filter(s => s.status === 'skipped').length} skipped. Report: artifacts/verify-report.json`);
process.exit(report.ok ? 0 : 1);
