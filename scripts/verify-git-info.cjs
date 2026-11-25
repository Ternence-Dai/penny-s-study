'use strict';

// Git provenance for the verify report (wave 4, item 3 follow-up).
//
// The release reconciliation ledger used to match a verify report to a
// commit by comparing the report's generatedAt timestamp with push times.
// That is inference, not evidence. The report now carries the code version
// it actually ran against:
//
//   git: { head, dirty, source }
//
// Resolution order for head:
//   1. VERIFY_GIT_HEAD environment variable (explicit operator override,
//      e.g. snapshot-tree workflows that know the remote head they
//      assembled but have no local .git) -> source: 'env'
//   2. `git rev-parse HEAD` in the working tree -> source: 'git'
//   3. Neither available -> head: null, source: 'unavailable'
//      (never guessed, never fabricated)
//
// dirty comes from `git status --porcelain` whenever git answers at all,
// independent of where head came from; when git cannot answer, dirty is
// null (unknown), not false. Probing must never fail the gate: every git
// invocation failure degrades to the unavailable path.

const { spawnSync } = require('node:child_process');

function defaultRunGit(args, cwd) {
  try {
    const result = spawnSync('git', args, {
      cwd, encoding: 'utf8', windowsHide: true, timeout: 30000
    });
    if (result.error || result.status !== 0 || typeof result.stdout !== 'string') {
      return null;
    }
    return result.stdout;
  } catch {
    return null;
  }
}

// options: { cwd, env, runGit } — runGit(args, cwd) returns stdout string
// or null on any failure; injectable for tests.
function resolveGitInfo(options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const runGit = options.runGit || defaultRunGit;

  const statusOut = runGit(['status', '--porcelain'], cwd);
  const dirty = typeof statusOut === 'string' ? statusOut.trim().length > 0 : null;

  const envHead = typeof env.VERIFY_GIT_HEAD === 'string' ? env.VERIFY_GIT_HEAD.trim() : '';
  if (envHead) {
    return { head: envHead, dirty, source: 'env' };
  }

  const headOut = runGit(['rev-parse', 'HEAD'], cwd);
  const head = typeof headOut === 'string' ? headOut.trim() : '';
  if (/^[0-9a-f]{40}$/i.test(head)) {
    return { head, dirty, source: 'git' };
  }

  return { head: null, dirty, source: 'unavailable' };
}

module.exports = { resolveGitInfo };
