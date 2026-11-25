// Data migration registry (wave 4, item 2; spec
// data-migration-registry-spec-v1, replicated from the EKPO / Health
// pilots and adapted to penny's audited reality).
//
// Penny has no single ledger object: nine datasets live under nine
// frozen keys as bare arrays/objects, and only the active practice
// session stamps a version inside its data. The registry in
// src/domain therefore DECLARES each dataset's baseline (the EKPO
// precedent: declared from the key era, never parsed from the key
// name) and holds an empty migration chain — no dataset has a second
// stored generation, and inventing one is exactly what the spec
// forbids. These tests are the spec §7 admission set adapted to that
// state: registry self-check, the oldest(=only) generation's fixture
// walking the (empty) chain to current, idempotence/purity, and the
// negative trio — higher version rejected explicitly, missing stamp
// rejected, malformed stamp rejected — plus the UI wiring proving a
// newer-build session is now distinguishable from corruption while
// the reject/lock behaviour itself is byte-for-byte the old one.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  STORAGE_REGISTRY,
  STORAGE_MIGRATIONS,
  PRACTICE_SESSION_CURRENT_VERSION,
  validateStorageRegistry,
  classifyPracticeSessionVersion
} from "../src/domain/index.js";

// The one versioned stored shape, at its only (hence oldest and
// current) generation. Mirrors the fixture the storage-recovery
// validator pins as the strict-schema valid session.
const practiceSessionV1 = {
  version: 1, level: "小学", label: "太阳系专项练习",
  questionIds: ["p001", "p002", "p003"],
  userAnswers: [1, null, [0, 2]],
  evaluated: [true, false, false],
  index: 1, correct: 1, wrong: 0, updatedAt: 1760000000000
};

test("registry self-check passes and covers every stored dataset key", () => {
  assert.equal(validateStorageRegistry(), true);
  assert.deepEqual(
    STORAGE_REGISTRY.map(entry => entry.key).sort(),
    [
      "a_active_practice_v1", "a_ai_v6", "a_attempts_v1", "a_d_v6",
      "a_fsrs_shadow_v1", "a_g_v6", "a_prefs_v6", "a_q_v6", "a_r_v6",
      "a_w_v6", "penny-error-events-v1"
    ]
  );
  const versioned = STORAGE_REGISTRY.filter(entry => entry.versionField !== null);
  assert.equal(versioned.length, 1, "exactly one dataset stamps a version in its data");
  assert.equal(versioned[0].id, "practice");
  assert.equal(versioned[0].versionField, "version");
});

test("registry self-check rejects doctored registries and gapped chains", () => {
  const clone = () => STORAGE_REGISTRY.map(entry => ({ ...entry }));
  const dupKey = clone(); dupKey[1] = { ...dupKey[1], key: dupKey[0].key };
  assert.throws(() => validateStorageRegistry(dupKey), TypeError);
  const noNote = clone(); noNote[0] = { ...noNote[0], note: "  " };
  assert.throws(() => validateStorageRegistry(noNote), TypeError);
  const badVersion = clone(); badVersion[0] = { ...badVersion[0], declaredVersion: 1.5 };
  assert.throws(() => validateStorageRegistry(badVersion), TypeError);
  const drifted = clone();
  drifted.find(entry => entry.id === "practice").declaredVersion = 99;
  assert.throws(() => validateStorageRegistry(drifted), TypeError,
    "the practice entry must agree with the classifier constant");
  assert.throws(() => validateStorageRegistry(STORAGE_REGISTRY, [
    { from: 1, to: 3, apply: x => x, note: "skips a generation" }
  ]), TypeError);
  assert.throws(() => validateStorageRegistry(STORAGE_REGISTRY, [
    { from: 1, to: 2, apply: x => x, note: "ok" },
    { from: 3, to: 4, apply: x => x, note: "gap after 2" }
  ]), TypeError);
  assert.equal(validateStorageRegistry(STORAGE_REGISTRY, [
    { from: 1, to: 2, apply: x => x, note: "a well-formed future step" }
  ]), true);
});

test("chain: the oldest supported shape is the current shape (empty chain)", () => {
  assert.deepEqual(STORAGE_MIGRATIONS, [],
    "no dataset has a second generation; the chain must stay empty until one lands");
  // Walking the chain from the oldest fixture therefore means: the
  // v1 fixture classifies as current with no migration applied.
  assert.deepEqual(classifyPracticeSessionVersion(practiceSessionV1), {
    status: "current", loadedVersion: 1, migratedFrom: null
  });
  assert.equal(PRACTICE_SESSION_CURRENT_VERSION, 1);
});

test("classifier is pure and idempotent on current data", () => {
  const frozen = Object.freeze({ ...practiceSessionV1 });
  const first = classifyPracticeSessionVersion(frozen);
  const second = classifyPracticeSessionVersion(frozen);
  assert.deepEqual(first, second);
  assert.deepEqual(frozen, practiceSessionV1, "classification must not mutate the payload");
});

test("negative trio: higher version, missing stamp, malformed stamp", () => {
  // Higher than current: explicit unsupported, with the trace pair —
  // this is the case that used to be indistinguishable from damage.
  assert.deepEqual(classifyPracticeSessionVersion({ ...practiceSessionV1, version: 2 }), {
    status: "unsupported-high", loadedVersion: 2, migratedFrom: null
  });
  assert.equal(classifyPracticeSessionVersion({ ...practiceSessionV1, version: 99 }).status,
    "unsupported-high");
  // No version field at all: not guessed as current, rejected as
  // invalid (the probe's long-standing behaviour, now named).
  const { version, ...stampless } = practiceSessionV1;
  assert.deepEqual(classifyPracticeSessionVersion(stampless), {
    status: "invalid", loadedVersion: null, migratedFrom: null
  });
  // Non-integer stamps and integers below the only generation.
  for (const bad of [1.5, "1", null, NaN, 0, -1]) {
    assert.equal(classifyPracticeSessionVersion({ ...practiceSessionV1, version: bad }).status,
      "invalid", "stamp " + String(bad) + " must be invalid");
  }
  for (const notRecord of [null, undefined, [], "x", 42]) {
    assert.equal(classifyPracticeSessionVersion(notRecord).status, "invalid");
  }
});

// ---- UI wiring: the real legacy-app segments in a vm ----
// Same assembly as test/error-event-log.test.js: the recorder block
// (which sits before the storage segment in the source) plus the
// storage segment the validators extract.

const appSource = fs.readFileSync(new URL("../assets/js/legacy-app.js", import.meta.url), "utf8");
const htmlSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8") + "\n" + appSource;
const blockStart = appSource.indexOf("var ERROR_EVENT_LOG_KEY");
const blockEnd = appSource.indexOf("/* ---------------- 错误事件账结束 ---------------- */", blockStart);
const errorBlock = appSource.slice(blockStart, blockEnd);
const segStart = htmlSource.indexOf("var storageRecoveryRequired = false;");
const segEnd = htmlSource.indexOf("\n/* ==========================================\n   知识卡片", segStart);
const storageSegment = htmlSource.slice(segStart, segEnd);
assert.ok(blockStart >= 0 && blockEnd > blockStart && segStart >= 0 && segEnd > segStart,
  "recorder block and storage segment must be extractable");

const KEY = {
  wrong: "a_w_v6", record: "a_r_v6", days: "a_d_v6", qstats: "a_q_v6",
  ai: "a_ai_v6", prefs: "a_prefs_v6", practice: "a_active_practice_v1", graduated: "a_g_v6"
};
const ERROR_KEY = "penny-error-events-v1";

function makeContext(storage) {
  const listeners = {};
  const sandbox = {
    localStorage: storage, listeners,
    window: { addEventListener(type, listener) { listeners[type] = listener; } },
    console: { warn() {} },
    KEY
  };
  vm.runInNewContext(
    "var ATTEMPT_LOG_KEY='a_attempts_v1'; var ATTEMPT_LOG_LIMIT=2000;\n" + errorBlock + "\n" + storageSegment +
    "\nthis.api={Store,practiceSessionVersionStatus," +
    "get locked(){return storageRecoveryRequired;}};",
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

test("ui wiring: a newer-build session is rejected, locked, preserved — and named as a version case", () => {
  const raw = JSON.stringify({ ...practiceSessionV1, version: 2 });
  const { data, calls, storage } = mapStorage({ [KEY.practice]: raw });
  const api = makeContext(storage);
  assert.equal(api.Store.getActivePractice(), null, "a higher-version session must not be restored");
  assert.equal(api.locked, true, "the pre-registry lock behaviour is unchanged");
  assert.equal(data.get(KEY.practice), raw, "original bytes must remain untouched");
  assert.ok(!calls.set.includes(KEY.practice), "no write may touch the session key");
  const events = readLog(data);
  const versionEvents = events.filter(entry => entry.kind === "session_rejected");
  assert.equal(versionEvents.length, 1, "exactly one explicit version event");
  assert.equal(versionEvents[0].context.stage, "unsupported-version");
  assert.ok(events.some(entry => entry.kind === "recovery_locked"),
    "the generic probe lock event still lands, as before");
});

test("ui wiring: a current-version session restores with no version event and no lock", () => {
  const raw = JSON.stringify(practiceSessionV1);
  const { data, storage } = mapStorage({ [KEY.practice]: raw });
  const api = makeContext(storage);
  const restored = api.Store.getActivePractice();
  assert.equal(restored.label, "太阳系专项练习");
  assert.equal(api.locked, false);
  assert.ok(!readLog(data).some(entry => entry.kind === "session_rejected"),
    "current data must not produce a version rejection");
});

test("ui wiring: a stampless session is rejected as damage, not as a version case", () => {
  const { version, ...stampless } = practiceSessionV1;
  const raw = JSON.stringify(stampless);
  const { data, storage } = mapStorage({ [KEY.practice]: raw });
  const api = makeContext(storage);
  assert.equal(api.Store.getActivePractice(), null);
  assert.equal(api.locked, true);
  assert.equal(data.get(KEY.practice), raw);
  assert.ok(!readLog(data).some(entry => entry.kind === "session_rejected"),
    "a missing stamp must stay indistinguishable-from-corruption by design: it is not a newer build");
});

test("ui wiring: the segment mirror agrees with the domain classifier", () => {
  const { storage } = mapStorage({});
  const api = makeContext(storage);
  const cases = [
    practiceSessionV1,
    { ...practiceSessionV1, version: 2 },
    { ...practiceSessionV1, version: 0 },
    { ...practiceSessionV1, version: "1" },
    null, [], "x"
  ];
  for (const value of cases) {
    assert.equal(api.practiceSessionVersionStatus(value),
      classifyPracticeSessionVersion(value).status,
      "mirror and domain classifier must agree");
  }
});
