// Verify report git provenance (wave 4, item 3 follow-up).
//
// The release reconciliation ledger must match a verify verdict to the
// exact commit it ran against. The report's git field therefore has a
// strict resolution contract, tested here against an injected git runner
// (no real repository needed, and the unavailable path is exercised
// deterministically):
//   1. VERIFY_GIT_HEAD env override wins over probing -> source 'env'.
//   2. Otherwise `git rev-parse HEAD` -> source 'git'.
//   3. Neither -> head null, source 'unavailable' (never fabricated).
// dirty mirrors `git status --porcelain` whenever git answers, and is
// null (unknown) — not false — when it does not.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { resolveGitInfo } = require('../scripts/verify-git-info.cjs');

const GIT_SHA = 'e06da008a6d23f5355ca2b0915dd6bda09c0ecd0';
const ENV_SHA = 'a'.repeat(40);

function runner({ head = null, status = null } = {}) {
  return (args) => (args[0] === 'rev-parse' ? head : status);
}

test('env override wins over git probing and is reported as source env', () => {
  const info = resolveGitInfo({
    cwd: '/nonexistent',
    env: { VERIFY_GIT_HEAD: `  ${ENV_SHA}  ` },
    runGit: runner({ head: `${GIT_SHA}\n`, status: '' })
  });
  assert.deepEqual(info, { head: ENV_SHA, dirty: false, source: 'env' });
});

test('git probing supplies head and a clean tree reports dirty false', () => {
  const info = resolveGitInfo({
    cwd: '/repo',
    env: {},
    runGit: runner({ head: `${GIT_SHA}\n`, status: '' })
  });
  assert.deepEqual(info, { head: GIT_SHA, dirty: false, source: 'git' });
});

test('porcelain output marks the tree dirty under both head sources', () => {
  const dirtyStatus = ' M scripts/verify.cjs\n';
  const viaGit = resolveGitInfo({
    cwd: '/repo', env: {}, runGit: runner({ head: `${GIT_SHA}\n`, status: dirtyStatus })
  });
  assert.equal(viaGit.dirty, true);
  const viaEnv = resolveGitInfo({
    cwd: '/repo', env: { VERIFY_GIT_HEAD: ENV_SHA }, runGit: runner({ status: dirtyStatus })
  });
  assert.deepEqual(viaEnv, { head: ENV_SHA, dirty: true, source: 'env' });
});

test('unavailable path: git silent -> head null, dirty null, source unavailable', () => {
  const info = resolveGitInfo({ cwd: '/not-a-repo', env: {}, runGit: runner({}) });
  assert.deepEqual(info, { head: null, dirty: null, source: 'unavailable' });
});

test('unavailable head still reports dirty when status alone answers', () => {
  // e.g. a fresh repository with no commits: rev-parse HEAD fails while
  // status succeeds. Head must stay null; dirty is real information.
  const info = resolveGitInfo({
    cwd: '/empty-repo', env: {}, runGit: runner({ head: null, status: '?? new-file\n' })
  });
  assert.deepEqual(info, { head: null, dirty: true, source: 'unavailable' });
});

test('malformed rev-parse output degrades to unavailable instead of trusting it', () => {
  const info = resolveGitInfo({
    cwd: '/repo', env: {}, runGit: runner({ head: 'not-a-sha\n', status: '' })
  });
  assert.deepEqual(info, { head: null, dirty: false, source: 'unavailable' });
});

test('verify.cjs wires the git field into the report it writes', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(here, '..', 'scripts', 'verify.cjs'), 'utf8');
  assert.match(source, /require\('\.\/verify-git-info\.cjs'\)/);
  assert.match(source, /resolveGitInfo\(\{ cwd: root \}\)/);
  assert.match(source, /\n  git,\n/);
});
