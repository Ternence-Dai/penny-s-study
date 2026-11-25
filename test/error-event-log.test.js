// Error event log (wave 4, item 4 — replicated from the Health pilot
// b094c4ee with kinds/context re-derived from penny's own failure
// paths): the domain layer owns the event shape — closed kind set,
// whitelisted scalar context, fingerprint aggregation, rolling cap —
// and the UI failure paths (exercised here through the same vm
// segment extraction as the data-fault fixtures) append events
// without changing any failure behaviour. The privacy contract is
// tested, not assumed: identifiable strings planted in question /
// answer fixtures must never appear in the serialized log.
//
// Wiring note: the recordErrorEvent block deliberately sits BEFORE
// the storage segment in legacy-app.js, so the validators that
// extract only the storage segment run with recording absent (their
// write-count assertions stay unpolluted). This harness prepends the
// block explicitly to exercise the real recording path.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  ERROR_EVENT_KINDS,
  ERROR_EVENT_LOG_MAX_EVENTS,
  ERROR_EVENT_LOG_SCHEMA_VERSION,
  ERROR_EVENT_LOG_STORAGE_KIND,
  buildErrorEvent,
  appendErrorEvent,
  errorEventFingerprint,
  summarizeErrorEvents,
  buildErrorLogExport
} from '../src/domain/index.js';

const AT = '2026-11-25T02:56:00.000Z';
const AT2 = '2026-11-25T02:57:00.000Z';
const ERROR_KEY = 'penny-error-events-v1';

// ---- domain: event construction and context whitelist ----

test('error event: builds a structured event with fingerprint and count', () => {
  const event = buildErrorEvent({
    kind: 'recovery_locked',
    message: '本地学习数据异常，写入已暂停以保护原始记录',
    context: { stage: 'primary-parse', errorName: 'SyntaxError', storageKind: 'primary' }
  }, AT);
  assert.equal(event.kind, 'recovery_locked');
  assert.equal(event.at, AT);
  assert.equal(event.lastAt, AT);
  assert.equal(event.count, 1);
  assert.equal(event.fingerprint, 'recovery_locked|syntaxerror|primary-parse');
  assert.deepEqual(event.context, { stage: 'primary-parse', errorName: 'SyntaxError', storageKind: 'primary' });
  assert.ok(event.id.startsWith('err-'));
});

test('error event: unknown kinds are rejected, never logged free-form', () => {
  assert.throws(() => buildErrorEvent({ kind: 'import_rejected', message: 'x' }, AT), { name: 'TypeError' },
    'Health kinds do not carry over — penny kinds are re-derived from penny failure paths');
  assert.throws(() => appendErrorEvent([], { kind: '', message: 'x' }, AT), { name: 'TypeError' });
  for (const kind of ERROR_EVENT_KINDS) {
    assert.equal(buildErrorEvent({ kind, message: 'm' }, AT).kind, kind);
  }
  assert.deepEqual([...ERROR_EVENT_KINDS].sort(), [
    'attempt_log_locked', 'export_failed', 'recovery_locked',
    'save_failed', 'session_rejected', 'storage_fault'
  ]);
});

test('error event: context is whitelisted scalars only — question and answer content cannot enter', () => {
  const event = buildErrorEvent({
    kind: 'session_rejected',
    message: '练习存档校验未通过，未恢复该会话',
    context: {
      stage: 'child-pool', childMode: true, rowCount: 3, poolCount: 144,
      question: 'SECRET-QUESTION-TEXT', answer: 'SECRET-ANSWER-TEXT',
      id: 'SECRET-QUESTION-ID', label: 'SECRET-SESSION-LABEL',
      source: 'SECRET-SOURCE-TEXT', nested: { deep: 'SECRET-NESTED' }, list: ['SECRET-LIST']
    }
  }, AT);
  assert.deepEqual(Object.keys(event.context).sort(), ['childMode', 'poolCount', 'rowCount', 'stage']);
  const serialized = JSON.stringify(event);
  assert.ok(!serialized.includes('SECRET'), 'no planted marker may survive the whitelist: ' + serialized);
});

test('error event: message is truncated to a bounded summary', () => {
  const event = buildErrorEvent({ kind: 'storage_fault', message: 'x'.repeat(500) }, AT);
  assert.equal(event.message.length, 240);
});

// ---- domain: fingerprint aggregation and rolling cap ----

test('error event: same fingerprint aggregates — count and lastAt move, first at stays', () => {
  let events = [];
  events = appendErrorEvent(events, { kind: 'recovery_locked', message: 'a', context: { stage: 'primary-parse', errorName: 'SyntaxError' } }, AT);
  events = appendErrorEvent(events, { kind: 'recovery_locked', message: 'a', context: { stage: 'primary-parse', errorName: 'SyntaxError' } }, AT2);
  assert.equal(events.length, 1);
  assert.equal(events[0].count, 2);
  assert.equal(events[0].at, AT);
  assert.equal(events[0].lastAt, AT2);
  events = appendErrorEvent(events, { kind: 'recovery_locked', message: 'b', context: { stage: 'primary-parse', errorName: 'TypeError' } }, AT2);
  assert.equal(events.length, 2, 'a different error class is a different fingerprint');
  assert.equal(errorEventFingerprint('save_failed', { stage: 'prefs-validation' }), 'save_failed||prefs-validation');
});

test('error event: append is pure and corrupt stored entries are dropped, not propagated', () => {
  const frozen = Object.freeze([Object.freeze(buildErrorEvent({ kind: 'save_failed', message: 'a', context: { stage: 'practice-start' } }, AT))]);
  const next = appendErrorEvent(frozen, { kind: 'save_failed', message: 'b', context: { stage: 'practice-resume' } }, AT2);
  assert.equal(next.length, 2);
  assert.equal(frozen.length, 1);
  const withJunk = appendErrorEvent([null, { kind: 'bogus' }, 'junk'], { kind: 'export_failed', message: 'x', context: { stage: 'attempt-export' } }, AT);
  assert.equal(withJunk.length, 1);
  assert.equal(withJunk[0].kind, 'export_failed');
});

test('error event: rolling cap keeps the newest distinct fingerprints', () => {
  let events = [];
  for (let i = 0; i < ERROR_EVENT_LOG_MAX_EVENTS + 25; i++) {
    events = appendErrorEvent(events, {
      kind: 'recovery_locked', message: 'm' + i,
      context: { stage: 'stage-' + i, errorName: 'TypeError' }
    }, AT);
  }
  assert.equal(events.length, ERROR_EVENT_LOG_MAX_EVENTS);
  assert.equal(events.length, 200);
  assert.equal(events[0].context.stage, 'stage-25', 'oldest 25 fingerprints rolled off');
  assert.equal(events[events.length - 1].context.stage, 'stage-' + (ERROR_EVENT_LOG_MAX_EVENTS + 24));
});

test('error event: summary groups by fingerprint, export envelope is versioned', () => {
  let events = [];
  events = appendErrorEvent(events, { kind: 'attempt_log_locked', message: 'a', context: { stage: 'attempt-parse', errorName: 'SyntaxError' } }, AT);
  events = appendErrorEvent(events, { kind: 'attempt_log_locked', message: 'a', context: { stage: 'attempt-parse', errorName: 'SyntaxError' } }, AT2);
  events = appendErrorEvent(events, { kind: 'export_failed', message: 'b', context: { stage: 'recovery-export', errorName: 'TypeError' } }, AT);
  const groups = summarizeErrorEvents(events);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].kind, 'attempt_log_locked');
  assert.equal(groups[0].count, 2);
  const exported = buildErrorLogExport(events, AT2);
  assert.equal(exported.schemaVersion, ERROR_EVENT_LOG_SCHEMA_VERSION);
  assert.equal(exported.storage, ERROR_EVENT_LOG_STORAGE_KIND);
  assert.equal(exported.eventCount, 2);
  assert.equal(exported.totalOccurrences, 3);
  assert.equal(exported.exportedAt, AT2);
});

// ---- UI wiring: the real legacy-app segments in a vm ----

const appSource = fs.readFileSync(new URL('../assets/js/legacy-app.js', import.meta.url), 'utf8');
const htmlSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8') + '\n' + appSource;

const blockStart = appSource.indexOf('var ERROR_EVENT_LOG_KEY');
const blockEnd = appSource.indexOf('/* ---------------- 错误事件账结束 ---------------- */', blockStart);
assert.ok(blockStart >= 0 && blockEnd > blockStart, 'error event log block must exist in legacy-app.js');
const errorBlock = appSource.slice(blockStart, blockEnd);

const segStart = htmlSource.indexOf('var storageRecoveryRequired = false;');
const segEnd = htmlSource.indexOf('\n/* ==========================================\n   知识卡片', segStart);
assert.ok(segStart >= 0 && segEnd > segStart, 'storage guard section must exist');
const storageSegment = htmlSource.slice(segStart, segEnd);
assert.ok(blockStart < appSource.indexOf('var storageRecoveryRequired = false;'),
  'the recording block must sit before the storage segment so validator extractions stay unpolluted');

const KEY = {
  wrong: 'a_w_v6', record: 'a_r_v6', days: 'a_d_v6', qstats: 'a_q_v6',
  ai: 'a_ai_v6', prefs: 'a_prefs_v6', practice: 'a_active_practice_v1', graduated: 'a_g_v6'
};
const ATTEMPTS = 'a_attempts_v1';

function makeContext(storage) {
  const listeners = {};
  const sandbox = {
    localStorage: storage, listeners,
    window: { addEventListener(type, listener) { listeners[type] = listener; } },
    console: { warn() {} },
    KEY
  };
  vm.runInNewContext(
    "var ATTEMPT_LOG_KEY='a_attempts_v1'; var ATTEMPT_LOG_LIMIT=2000;\n" + errorBlock + '\n' + storageSegment +
    '\nthis.api={recordErrorEvent,safeStorageGet,safeStorageSet,safeStorageJSON,readAttemptLog,Store,' +
    'get locked(){return storageRecoveryRequired;},get attemptLogLocked(){return attemptLogRecoveryRequired;}};',
    sandbox
  );
  return sandbox.api;
}

function mapStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  const calls = { set: [], remove: [] };
  const storage = {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { calls.set.push(key); data.set(key, String(value)); },
    removeItem: key => { calls.remove.push(key); data.delete(key); }
  };
  return { data, calls, storage };
}

function readLog(data) {
  const raw = data.get(ERROR_KEY);
  return raw ? JSON.parse(raw) : [];
}

test('ui wiring: truncated primary ledger locks writes, preserves bytes, and lands one recovery_locked event', () => {
  const raw = '[{"mode":"practice","total":3,"cor';
  const { data, calls, storage } = mapStorage({ [KEY.record]: raw });
  const api = makeContext(storage);
  assert.equal(api.locked, true, 'truncated persisted JSON must activate the recovery lock');
  assert.equal(api.safeStorageSet(KEY.record, '[]'), false, 'writes must stay refused while locked');
  assert.equal(data.get(KEY.record), raw, 'original truncated bytes must remain untouched');
  assert.ok(!calls.set.includes(KEY.record), 'recording must never write a primary ledger key');
  const events = readLog(data);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'recovery_locked');
  assert.equal(events[0].context.stage, 'primary-parse');
  assert.equal(events[0].context.storageKind, 'primary');
  assert.equal(events[0].count, 1);
});

test('ui wiring: the same corruption seen by a second tab aggregates instead of duplicating', () => {
  const raw = '[{"mode":"practice","total":3,"cor';
  const { data, storage } = mapStorage({ [KEY.record]: raw });
  makeContext(storage);
  makeContext(storage);
  const events = readLog(data);
  assert.equal(events.length, 1, 'same fingerprint must stay one entry');
  assert.equal(events[0].count, 2);
});

test('ui wiring: corrupt attempt log is isolated to the sidecar lock and leaks no planted content', () => {
  const raw = '[{"id":"SECRET-QID-ATTEMPT","correct":true,"at":1,"state":{"book":"none"},"note":"SECRET-ANSWER-ATTEMPT"';
  const { data, storage } = mapStorage({ [ATTEMPTS]: raw });
  const api = makeContext(storage);
  assert.deepEqual([...api.readAttemptLog()], []);
  assert.equal(api.attemptLogLocked, true);
  assert.equal(api.locked, false, 'attempt-log corruption must not freeze the primary ledgers');
  assert.equal(data.get(ATTEMPTS), raw, 'original attempt bytes must remain untouched');
  const events = readLog(data);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'attempt_log_locked');
  assert.equal(events[0].context.stage, 'attempt-parse');
  assert.ok(!JSON.stringify(events).includes('SECRET'), 'planted attempt content must not enter the log');
});

test('ui wiring: shape-invalid attempt log records attempt-shape, shape-invalid stats record primary-shape without the polluted key', () => {
  const { data, storage } = mapStorage({
    [ATTEMPTS]: JSON.stringify([{ id: 'SECRET-QID-SHAPE' }]),
    [KEY.qstats]: JSON.stringify({ 'SECRET-QID-QSTATS': { t: 1, c: 5, last: 1760000000000 } })
  });
  const api = makeContext(storage);
  assert.deepEqual([...api.readAttemptLog()], []);
  assert.equal(api.attemptLogLocked, true);
  assert.equal(Object.keys(api.Store.getQStats()).length, 0, 'polluted stats must degrade to an empty object');
  assert.equal(api.locked, true);
  const events = readLog(data);
  const kinds = events.map(e => e.kind + '@' + e.context.stage).sort();
  assert.deepEqual(kinds, ['attempt_log_locked@attempt-shape', 'recovery_locked@primary-shape']);
  assert.ok(!JSON.stringify(events).includes('SECRET'), 'polluted storage keys (question ids) must not enter the log');
});

test('ui wiring: rejected preferences land a save_failed event and change nothing', () => {
  const { data, storage } = mapStorage();
  const api = makeContext(storage);
  assert.equal(api.Store.savePrefs({ speed: 99 }), false);
  assert.equal(data.has(KEY.prefs), false, 'rejected preferences must not be written');
  const events = readLog(data);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'save_failed');
  assert.equal(events[0].context.stage, 'prefs-validation');
});

test('ui wiring: recording swallows total storage failure and the main flow is unharmed', () => {
  const broken = {
    getItem() { throw new Error('storage gone'); },
    setItem() { throw new Error('storage gone'); },
    removeItem() { throw new Error('storage gone'); }
  };
  const api = makeContext(broken);
  assert.equal(api.locked, true, 'unreadable storage must still fail closed');
  assert.equal(api.recordErrorEvent('save_failed', { stage: 'practice-start' }), false,
    'recording must report its own failure by return value, never by throwing');
  assert.equal(api.safeStorageSet(KEY.record, '[]'), false, 'the original refusal behaviour is unchanged');
});

test('ui wiring: fallback recorder aggregates and rolls at 200 distinct fingerprints', () => {
  const { data, storage } = mapStorage();
  const api = makeContext(storage);
  assert.equal(api.recordErrorEvent('save_failed', { stage: 'practice-start' }), true);
  assert.equal(api.recordErrorEvent('save_failed', { stage: 'practice-start' }), true);
  let events = readLog(data);
  assert.equal(events.length, 1);
  assert.equal(events[0].count, 2);
  for (let i = 0; i < 205; i++) api.recordErrorEvent('recovery_locked', { stage: 'stage-' + i });
  events = readLog(data);
  assert.equal(events.length, 200);
  assert.equal(events[events.length - 1].context.stage, 'stage-204');
});

test('ui wiring: export entry point and guarded call sites are present in the app source', () => {
  assert.ok(appSource.includes('function exportErrorLog('), 'exportErrorLog must exist');
  assert.ok(appSource.includes('onclick="exportErrorLog()"'), 'settings page must offer the export');
  assert.ok(appSource.includes('导出错误日志'), 'settings row label must be present');
  assert.ok(appSource.includes("ERROR_EVENT_LOG_KEY = 'penny-error-events-v1'"), 'dedicated storage key must exist');
  const callSites = appSource.match(/recordErrorEvent\('/g) || [];
  assert.ok(callSites.length >= 12, 'failure paths must be wired, found ' + callSites.length);
  const guarded = appSource.match(/typeof recordErrorEvent==='function'\)recordErrorEvent\(/g) || [];
  assert.ok(guarded.length >= 12, 'call sites inside extracted segments must be typeof-guarded, found ' + guarded.length);
});
