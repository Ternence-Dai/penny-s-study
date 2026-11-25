// Data-fault fixtures (wave 4, item 1): the suite otherwise tests whether
// the logic is right; these fixtures test what happens when the DATA is
// wrong — truncated JSON in a primary ledger, type-polluted fields, an
// attempt log (a_attempts_v1) whose FSRS revlog fields are partial or out
// of range, and an over-limit attempt log — on the load path and on the
// raw recovery-packet export path (penny has no backup-file import; the
// recovery packet is export-only and a restore is a reload through this
// same load path).
// Contract under test: never crash with an uncontrolled error, never write
// unvalidated data over the active store. Primary-ledger faults degrade by
// locking writes and preserving the original bytes; attempt-log faults are
// isolated to the sidecar lock and must never freeze the primary ledgers.
// Legacy shapes (wrong-book rows without review metadata, attempt entries
// without revlog fields) must keep loading. Business semantics, the
// scheduler, the revlog field semantics and the child-pool isolation are
// untouched.
//
// The harness mirrors scripts/validate-storage-recovery.cjs: it extracts
// the real storage segment from index.html + assets/js/legacy-app.js and
// runs it in a vm against a Map-backed localStorage. Cases here complement
// that validator (which predates the revlog fields) rather than repeat it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8') +
  '\n' + fs.readFileSync(new URL('../assets/js/legacy-app.js', import.meta.url), 'utf8');
const start = html.indexOf('var storageRecoveryRequired = false;');
const end = html.indexOf('\n/* ==========================================\n   知识卡片', start);
assert.ok(start >= 0 && end > start, 'storage guard section must exist');
const source = html.slice(start, end);

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
    "var ATTEMPT_LOG_KEY='a_attempts_v1'; var ATTEMPT_LOG_LIMIT=2000;\n" + source +
    '\nthis.api={safeStorageGet,safeStorageSet,safeStorageRemove,safeStorageJSON,' +
    'buildRawLearningRecoveryPacket,readAttemptLog,appendAttemptLog,isAttemptLogEntry,isAttemptLogStorage,' +
    'isQuestionStatsStorage,isStudyDayStorage,isPracticeRecordStorage,Store,' +
    // Dates handed to the segment must come from its own realm: the packet
    // builder checks `instanceof Date`, and a host-realm Date is not an
    // instance of the vm realm's Date (in the browser there is one realm).
    'vmDate:function(ms){return new Date(ms);},' +
    'get locked(){return storageRecoveryRequired;},get attemptLogLocked(){return attemptLogRecoveryRequired;}};',
    sandbox
  );
  return sandbox.api;
}

function mapStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  const calls = { set: 0, remove: 0 };
  const storage = {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { calls.set++; data.set(key, String(value)); },
    removeItem: key => { calls.remove++; data.delete(key); }
  };
  return { data, calls, storage };
}

function attemptEntry(i, extra = {}) {
  return { id: 'q' + i, correct: true, at: 1760000000000 + i, state: { book: 'none' }, ...extra };
}

// ---- load path: primary ledgers ----

test('fault fixture: truncated records JSON locks writes and preserves the original bytes', () => {
  const raw = '[{"mode":"practice","total":3,"cor';
  const { data, storage } = mapStorage({ [KEY.record]: raw });
  const api = makeContext(storage);
  assert.equal(api.locked, true, 'truncated persisted JSON must activate the recovery lock');
  const fallback = api.safeStorageJSON(KEY.record, [], api.isPracticeRecordStorage);
  assert.equal(fallback.length, 0, 'failed load must expose the fallback, not partial data');
  assert.equal(api.safeStorageSet(KEY.record, '[]'), false, 'writes must stay refused while locked');
  assert.equal(data.get(KEY.record), raw, 'original truncated bytes must remain untouched');
});

test('fault fixture: type-polluted question stats degrade to the fallback and lock', () => {
  // c (correct) greater than t (total) violates isQuestionStatsStorage.
  const raw = '{"p001":{"t":1,"c":5,"last":1760000000000}}';
  const { data, storage } = mapStorage({ [KEY.qstats]: raw });
  const api = makeContext(storage);
  const stats = api.Store.getQStats();
  assert.equal(Object.keys(stats).length, 0, 'polluted stats must degrade to an empty object');
  assert.equal(api.locked, true, 'shape-invalid stats must activate the recovery lock');
  assert.equal(data.get(KEY.qstats), raw, 'polluted original must remain untouched');
});

test('fault fixture: type-polluted study days degrade to the fallback and lock', () => {
  const raw = '[20261125]';
  const { data, storage } = mapStorage({ [KEY.days]: raw });
  const api = makeContext(storage);
  const days = api.safeStorageJSON(KEY.days, [], api.isStudyDayStorage);
  assert.equal(days.length, 0);
  assert.equal(api.locked, true, 'non-string study-day entries must activate the recovery lock');
  assert.equal(data.get(KEY.days), raw);
});

test('fault fixture: empty storage is a clean first launch with no locks', () => {
  const { storage } = mapStorage();
  const api = makeContext(storage);
  assert.equal(api.locked, false);
  assert.equal(api.attemptLogLocked, false);
  assert.equal(api.readAttemptLog().length, 0);
  assert.equal(api.Store.getWrong().length, 0);
  assert.equal(Object.keys(api.Store.getQStats()).length, 0);
  const packet = api.buildRawLearningRecoveryPacket(storage, api.vmDate(1760000000000));
  assert.equal(packet.entries.length, 9, 'packet covers the 8 ledgers plus the attempt log');
  assert.ok(packet.entries.every(entry => entry.raw === null), 'first launch has no stored bytes');
});

// ---- attempt log (a_attempts_v1) and its revlog fields ----

test('fault fixture: partial revlog fields isolate the attempt log without freezing the ledgers', () => {
  const raw = JSON.stringify([attemptEntry(1, { quality: 4 })]); // rating/fsrsState missing: all-or-none violated
  const { data, calls, storage } = mapStorage({ [ATTEMPTS]: raw });
  const api = makeContext(storage);
  assert.equal(api.readAttemptLog().length, 0, 'a partial-revlog log must not be read as valid history');
  assert.equal(api.attemptLogLocked, true, 'the sidecar lock must engage');
  assert.equal(api.locked, false, 'the primary ledgers must stay writable');
  const setsBefore = calls.set;
  assert.equal(api.appendAttemptLog(attemptEntry(2, { quality: 4, rating: 3, fsrsState: 0 })), false,
    'appends must be refused while the sidecar is locked');
  assert.equal(calls.set, setsBefore, 'a refused append must not write');
  assert.equal(data.get(ATTEMPTS), raw, 'the malformed log bytes must remain available for recovery export');
  assert.equal(api.Store.savePrefs({ speed: 1.2, volume: 0.8, pitch: 1.1, aiModel: 'general' }), true,
    'primary learning settings remain writable after an isolated attempt-log fault');
});

test('fault fixture: out-of-range revlog rating isolates the attempt log', () => {
  const raw = JSON.stringify([attemptEntry(1, { quality: 4, rating: 5, fsrsState: 2 })]); // rating must be 1..4
  const { data, storage } = mapStorage({ [ATTEMPTS]: raw });
  const api = makeContext(storage);
  assert.equal(api.readAttemptLog().length, 0);
  assert.equal(api.attemptLogLocked, true);
  assert.equal(api.locked, false);
  assert.equal(data.get(ATTEMPTS), raw);
});

test('fault fixture: legacy entries and full revlog entries load side by side', () => {
  const legacy = attemptEntry(1);
  const revlog = attemptEntry(2, { quality: 5, rating: 4, fsrsState: 2 });
  const { storage } = mapStorage({ [ATTEMPTS]: JSON.stringify([legacy, revlog]) });
  const api = makeContext(storage);
  const log = api.readAttemptLog();
  assert.equal(log.length, 2, 'pre-revlog entries stay valid next to revlog entries');
  assert.equal(log[1].quality, 5);
  assert.equal(log[1].rating, 4);
  assert.equal(log[1].fsrsState, 2);
  assert.equal(api.attemptLogLocked, false);
  assert.equal(api.locked, false);
});

test('fault fixture: an over-limit stored attempt log is isolated, never silently truncated on read', () => {
  const entries = Array.from({ length: 2001 }, (_, i) => attemptEntry(i));
  const raw = JSON.stringify(entries);
  const { data, storage } = mapStorage({ [ATTEMPTS]: raw });
  const api = makeContext(storage);
  assert.equal(api.readAttemptLog().length, 0, 'an over-limit log fails validation as a whole');
  assert.equal(api.attemptLogLocked, true);
  assert.equal(api.locked, false);
  assert.equal(data.get(ATTEMPTS), raw, 'the over-limit bytes must remain untouched');
});

test('fault fixture: append at the limit rolls over and keeps the newest entry', () => {
  const entries = Array.from({ length: 2000 }, (_, i) => attemptEntry(i));
  const { data, storage } = mapStorage({ [ATTEMPTS]: JSON.stringify(entries) });
  const api = makeContext(storage);
  assert.equal(api.appendAttemptLog(attemptEntry(2000, { quality: 4, rating: 3, fsrsState: 0 })), true);
  const stored = JSON.parse(data.get(ATTEMPTS));
  assert.equal(stored.length, 2000, 'the log stays capped at the limit');
  assert.equal(stored[0].id, 'q1', 'the oldest entry rolls off');
  assert.equal(stored[stored.length - 1].id, 'q2000', 'the newest entry is kept');
});

test('fault fixture: a failed attempt-log write degrades silently and changes nothing', () => {
  const data = new Map([[ATTEMPTS, '[]']]);
  const storage = {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: () => { throw new Error('simulated quota failure on attempt-log write'); },
    removeItem: key => data.delete(key)
  };
  const api = makeContext(storage);
  assert.equal(api.appendAttemptLog(attemptEntry(1)), false, 'a failed append reports false');
  assert.equal(data.get(ATTEMPTS), '[]', 'the stored log must not be replaced by a fallback');
  assert.equal(api.attemptLogLocked, false, 'a transient write failure is not data corruption');
  assert.equal(api.locked, false, 'the primary ledgers must not be frozen by a sidecar write failure');
});

// ---- recovery packet export path ----

test('fault fixture: recovery packet preserves garbage bytes verbatim and writes nothing', () => {
  const seed = {};
  for (const name of Object.keys(KEY)) seed[KEY[name]] = '{garbage-' + name;
  seed[ATTEMPTS] = '[{broken-attempt';
  const { calls, storage } = mapStorage(seed);
  const api = makeContext(mapStorage().storage);
  const packet = api.buildRawLearningRecoveryPacket(storage, api.vmDate(1760000000000));
  assert.equal(packet.format, 'penny-s-study-raw-local-storage-recovery');
  assert.equal(packet.version, 1);
  assert.equal(packet.exportedAt, new Date(1760000000000).toISOString());
  assert.equal(packet.entries.length, 9);
  for (const entry of packet.entries) {
    assert.equal(entry.raw, seed[entry.key], `packet must carry the exact stored bytes for ${entry.key}`);
  }
  assert.equal(calls.set, 0, 'building a packet must not write');
  assert.equal(calls.remove, 0, 'building a packet must not remove');
});

test('fault fixture: recovery packet builder rejects unusable inputs explicitly', () => {
  const { storage } = mapStorage();
  const api = makeContext(mapStorage().storage);
  // Match by error name: the builder runs in a vm realm, so its TypeError
  // constructor is not the host realm's.
  assert.throws(() => api.buildRawLearningRecoveryPacket(null, api.vmDate(1760000000000)), { name: 'TypeError' });
  assert.throws(() => api.buildRawLearningRecoveryPacket(storage, api.vmDate(Number.NaN)), { name: 'TypeError' });
  assert.throws(() => api.buildRawLearningRecoveryPacket(storage, '2026-11-25'), { name: 'TypeError' });
});
