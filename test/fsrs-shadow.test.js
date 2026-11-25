// FSRS shadow mode (follows the revlog at 19765f7a — evidence
// before any switch; switching itself is NOT approved).
//
// The shadow computes what FSRS-5 with public default parameters
// would suggest, from the same revlog input the live scheduler's
// reviews produce, and records the two intervals side by side. It
// never feeds back into scheduling. These tests pin:
// - the FSRS-5 math against the published formulas (awesome-fsrs
//   wiki, "The Algorithm": FSRS-5 + FSRS-4.5 sections);
// - record shape, append cap, divergence summary (including the
//   insufficient-sample refusal to conclude);
// - the red line: the live scheduler's outputs are byte-identical
//   to the golden matrix captured from the pre-shadow code;
// - the UI wiring in a vm: shadow writes land in their own key,
//   corrupt shadow bytes are preserved and lock nothing, and an
//   end-to-end recordQuestionOutcome run schedules exactly as
//   before while appending one shadow record.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  FSRS_SHADOW_DEFAULT_WEIGHTS,
  FSRS_SHADOW_LOG_LIMIT,
  FSRS_SHADOW_MIN_SAMPLE,
  fsrsShadowRetrievability,
  fsrsShadowInitialDifficulty,
  fsrsShadowInitialState,
  fsrsShadowNextDifficulty,
  fsrsShadowNextState,
  fsrsShadowIntervalDays,
  replayFsrsShadow,
  isFsrsShadowRecord,
  buildFsrsShadowRecord,
  appendFsrsShadowRecord,
  summarizeFsrsShadowDivergence,
  nextReviewDate
} from "../src/domain/index.js";

const DAY = 86400000;
const T0 = 1760000000000;

function approx(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    label + ": expected ~" + expected + ", got " + actual);
}

test("fsrs math: initial state comes straight from the default weights", () => {
  assert.equal(FSRS_SHADOW_DEFAULT_WEIGHTS.length, 19);
  for (const rating of [1, 2, 3, 4]) {
    assert.equal(fsrsShadowInitialState(rating).stability,
      FSRS_SHADOW_DEFAULT_WEIGHTS[rating - 1]);
  }
  // D0(G) = w4 - e^{w5*(G-1)} + 1, clamped to [1, 10].
  approx(fsrsShadowInitialDifficulty(1), 7.1949, 1e-9, "D0(1)");
  approx(fsrsShadowInitialDifficulty(3), 5.2827, 1e-3, "D0(3)");
  approx(fsrsShadowInitialDifficulty(4), 3.2240, 1e-3, "D0(4)");
  // First-review intervals at retention 0.9 equal round(S0).
  assert.equal(fsrsShadowIntervalDays(fsrsShadowInitialState(1).stability), 1);
  assert.equal(fsrsShadowIntervalDays(fsrsShadowInitialState(2).stability), 1);
  assert.equal(fsrsShadowIntervalDays(fsrsShadowInitialState(3).stability), 3);
  assert.equal(fsrsShadowIntervalDays(fsrsShadowInitialState(4).stability), 16);
});

test("fsrs math: retrievability anchors and interval inversion", () => {
  assert.equal(fsrsShadowRetrievability(0, 3.173), 1);
  approx(fsrsShadowRetrievability(3.173, 3.173), 0.9, 1e-12, "R(S, S) = 0.9 by construction");
  // I(0.9, S) = S exactly (the curve constants are chosen for it).
  approx(fsrsShadowIntervalDays(10, 0.9), 10, 0.5001, "I(0.9, S) ~ S");
  assert.throws(() => fsrsShadowIntervalDays(10, 1), RangeError);
  assert.throws(() => fsrsShadowRetrievability(-1, 3), RangeError);
});

test("fsrs math: a Good review after 3 days grows stability per the published formula", () => {
  const initial = fsrsShadowInitialState(3); // S = 3.173, D ~= 5.2827
  const next = fsrsShadowNextState(initial, 3, 3);
  // Hand-computed from the wiki formulas: D barely moves (mean
  // reversion toward D0(4) with w7 = 0.0046), S ~= 10.75.
  approx(next.difficulty, 5.2732, 0.01, "difficulty after Good");
  approx(next.stability, 10.748, 0.05, "stability after Good");
  assert.equal(fsrsShadowIntervalDays(next.stability), 11);
  // Difficulty update: at D=10 an Easy rating leaves the damped
  // value at 10, then mean reversion pulls it slightly toward D0(4).
  approx(fsrsShadowNextDifficulty(10, 4), 0.0046 * 3.2240 + 0.9954 * 10, 1e-3, "reversion at D=10");
  assert.ok(fsrsShadowNextDifficulty(1, 1) >= 1, "difficulty floor holds");
});

test("fsrs math: same-day branch, hard penalty, easy bonus and lapse", () => {
  const state = { stability: 10, difficulty: 5 };
  // Same-day Good: S' = S * e^{w17 * (0 + w18)} ~= S * 1.4078.
  const sameDay = fsrsShadowNextState(state, 3, 0);
  approx(sameDay.stability, 10 * Math.exp(0.51655 * 0.6621), 1e-6, "same-day Good factor");
  // After a real interval: Hard grows stability less than Good,
  // Easy more, and Again (lapse) drops it below the prior value.
  const hard = fsrsShadowNextState(state, 2, 10);
  const good = fsrsShadowNextState(state, 3, 10);
  const easy = fsrsShadowNextState(state, 4, 10);
  assert.ok(hard.stability < good.stability, "hard penalty must bite");
  assert.ok(easy.stability > good.stability, "easy bonus must bite");
  const lapse = fsrsShadowNextState(state, 1, 10);
  assert.ok(lapse.stability < state.stability, "a lapse must reduce stability");
  assert.ok(lapse.stability >= 0.01, "stability floor holds");
});

test("replay: chronological rated history rebuilds state; junk is rejected", () => {
  const reviews = [
    { at: T0, rating: 3 },
    { at: T0 + 3 * DAY, rating: 3 },
    { at: T0 + 14 * DAY, rating: 4 },
    { at: T0 + 40 * DAY, rating: 1 }
  ];
  const snapshot = JSON.parse(JSON.stringify(reviews));
  const result = replayFsrsShadow(reviews);
  assert.deepEqual(reviews, snapshot, "replay must not mutate its input");
  assert.equal(result.reviewCount, 4);
  assert.equal(result.lastElapsedDays, 26);
  assert.ok(result.intervalDays >= 1);
  assert.equal(replayFsrsShadow([]), null);
  assert.throws(() => replayFsrsShadow([{ at: T0, rating: 3 }, { at: T0 - DAY, rating: 3 }]),
    RangeError, "out-of-order history must be rejected, not silently replayed");
  assert.throws(() => replayFsrsShadow([{ at: T0 }]), RangeError,
    "an unrated (legacy) entry must be rejected here; filtering is the caller's job");
  assert.throws(() => replayFsrsShadow([{ at: T0, rating: 5 }]), RangeError);
});

function validRecord(overrides = {}) {
  return {
    id: "q1", at: T0, rating: 3, liveIntervalDays: 3, liveAction: "schedule",
    fsrsIntervalDays: 11, stability: 10.748, difficulty: 5.2732,
    elapsedDays: 3, historyCount: 2, ...overrides
  };
}

test("record shape: strict keys and the graduate/live-interval consistency rule", () => {
  assert.equal(isFsrsShadowRecord(validRecord()), true);
  assert.equal(isFsrsShadowRecord(validRecord({ liveAction: "graduate", liveIntervalDays: null })), true);
  assert.equal(isFsrsShadowRecord(validRecord({ liveAction: "graduate" })), false,
    "a graduation carries no live interval");
  assert.equal(isFsrsShadowRecord(validRecord({ liveIntervalDays: null })), false,
    "a scheduled record must carry the interval the scheduler gave");
  assert.equal(isFsrsShadowRecord(validRecord({ extra: 1 })), false);
  assert.equal(isFsrsShadowRecord(validRecord({ rating: 0 })), false);
  assert.equal(isFsrsShadowRecord(validRecord({ stability: 0 })), false);
  const { difficulty, ...missing } = validRecord();
  assert.equal(isFsrsShadowRecord(missing), false);
});

test("build record: replays to the current review and refuses a mismatched tail", () => {
  const reviews = [{ at: T0, rating: 3 }, { at: T0 + 3 * DAY, rating: 3 }];
  const record = buildFsrsShadowRecord({
    cardId: "q1", reviewedAtMs: T0 + 3 * DAY, rating: 3,
    liveIntervalDays: 5, liveAction: "schedule", reviews
  });
  assert.equal(record.fsrsIntervalDays, 11);
  assert.equal(record.historyCount, 2);
  assert.equal(record.elapsedDays, 3);
  assert.ok(Object.isFrozen(record));
  assert.throws(() => buildFsrsShadowRecord({
    cardId: "q1", reviewedAtMs: T0 + 4 * DAY, rating: 3,
    liveIntervalDays: 5, liveAction: "schedule", reviews
  }), RangeError, "the replay tail must be the review being recorded");
  assert.throws(() => buildFsrsShadowRecord({
    cardId: "q1", reviewedAtMs: T0 + 3 * DAY, rating: 3,
    liveIntervalDays: 5, liveAction: "graduate", reviews
  }), RangeError);
});

test("append: rolling cap matches the attempt log and invalid stored rows drop", () => {
  assert.equal(FSRS_SHADOW_LOG_LIMIT, 2000);
  let log = [];
  for (let i = 0; i < FSRS_SHADOW_LOG_LIMIT; i++) {
    log.push(validRecord({ at: T0 + i }));
  }
  const next = appendFsrsShadowRecord(log, validRecord({ at: T0 + 99999, id: "newest" }));
  assert.equal(next.length, FSRS_SHADOW_LOG_LIMIT);
  assert.equal(next[next.length - 1].id, "newest");
  assert.equal(log.length, FSRS_SHADOW_LOG_LIMIT, "append must not mutate its input");
  const cleaned = appendFsrsShadowRecord([{ junk: true }, validRecord()], validRecord({ id: "q2" }));
  assert.deepEqual(cleaned.map(r => r.id), ["q1", "q2"]);
  assert.throws(() => appendFsrsShadowRecord([], { junk: true }), TypeError);
});

test("summary: exact statistics, graduate exclusion, insufficient-sample flag", () => {
  const records = [
    validRecord({ fsrsIntervalDays: 11, liveIntervalDays: 5 }),   // +6
    validRecord({ fsrsIntervalDays: 3, liveIntervalDays: 3 }),    // 0
    validRecord({ fsrsIntervalDays: 2, liveIntervalDays: 6 }),    // -4
    validRecord({ fsrsIntervalDays: 9, liveIntervalDays: 1 }),    // +8
    validRecord({ liveAction: "graduate", liveIntervalDays: null, fsrsIntervalDays: 30 })
  ];
  const s = summarizeFsrsShadowDivergence(records);
  assert.equal(s.totalRecords, 5);
  assert.equal(s.comparedCount, 4, "graduations are counted but never compared");
  assert.equal(s.meanDeltaDays, 2.5);
  assert.equal(s.medianDeltaDays, 3);
  assert.equal(s.fsrsLongerCount, 2);
  assert.equal(s.fsrsShorterCount, 1);
  assert.equal(s.equalCount, 1);
  assert.equal(s.fsrsLongerShare, 0.5);
  assert.equal(s.sufficient, false);
  assert.equal(s.minSample, FSRS_SHADOW_MIN_SAMPLE);
  const many = [];
  for (let i = 0; i < FSRS_SHADOW_MIN_SAMPLE; i++) many.push(validRecord({ at: T0 + i }));
  assert.equal(summarizeFsrsShadowDivergence(many).sufficient, true);
  const empty = summarizeFsrsShadowDivergence([]);
  assert.equal(empty.comparedCount, 0);
  assert.equal(empty.meanDeltaDays, null);
  assert.equal(empty.fsrsLongerShare, null);
});

// Golden matrix captured from the pre-shadow implementation of
// nextReviewDate (baseline main 563e07dc, 2026-11-25). The shadow
// change must not move a single one of these outputs.
const GOLDEN = [[0,0,1,"2026-01-16T08:30:00.000Z"],[0,1,1,"2026-01-16T08:30:00.000Z"],[0,2,1,"2026-01-16T08:30:00.000Z"],[0,5,1,"2026-01-16T08:30:00.000Z"],[0,10,1,"2026-01-16T08:30:00.000Z"],[0,40,1,"2026-01-16T08:30:00.000Z"],[0,100,1,"2026-01-16T08:30:00.000Z"],[0,3650,1,"2026-01-16T08:30:00.000Z"],[1,0,1,"2026-01-16T08:30:00.000Z"],[1,1,1,"2026-01-16T08:30:00.000Z"],[1,2,1,"2026-01-16T08:30:00.000Z"],[1,5,1,"2026-01-16T08:30:00.000Z"],[1,10,1,"2026-01-16T08:30:00.000Z"],[1,40,1,"2026-01-16T08:30:00.000Z"],[1,100,1,"2026-01-16T08:30:00.000Z"],[1,3650,1,"2026-01-16T08:30:00.000Z"],[2,0,1,"2026-01-16T08:30:00.000Z"],[2,1,1,"2026-01-16T08:30:00.000Z"],[2,2,1,"2026-01-16T08:30:00.000Z"],[2,5,1,"2026-01-16T08:30:00.000Z"],[2,10,1,"2026-01-16T08:30:00.000Z"],[2,40,1,"2026-01-16T08:30:00.000Z"],[2,100,1,"2026-01-16T08:30:00.000Z"],[2,3650,1,"2026-01-16T08:30:00.000Z"],[3,0,1,"2026-01-16T08:30:00.000Z"],[3,1,2,"2026-01-17T08:30:00.000Z"],[3,2,3,"2026-01-18T08:30:00.000Z"],[3,5,8,"2026-01-23T08:30:00.000Z"],[3,10,15,"2026-01-30T08:30:00.000Z"],[3,40,60,"2026-03-16T08:30:00.000Z"],[3,100,150,"2026-06-14T08:30:00.000Z"],[3,3650,3650,"2036-01-13T08:30:00.000Z"],[4,0,1,"2026-01-16T08:30:00.000Z"],[4,1,3,"2026-01-18T08:30:00.000Z"],[4,2,5,"2026-01-20T08:30:00.000Z"],[4,5,13,"2026-01-28T08:30:00.000Z"],[4,10,25,"2026-02-09T08:30:00.000Z"],[4,40,100,"2026-04-25T08:30:00.000Z"],[4,100,250,"2026-09-22T08:30:00.000Z"],[4,3650,3650,"2036-01-13T08:30:00.000Z"],[5,0,1,"2026-01-16T08:30:00.000Z"],[5,1,3,"2026-01-18T08:30:00.000Z"],[5,2,5,"2026-01-20T08:30:00.000Z"],[5,5,13,"2026-01-28T08:30:00.000Z"],[5,10,25,"2026-02-09T08:30:00.000Z"],[5,40,100,"2026-04-25T08:30:00.000Z"],[5,100,250,"2026-09-22T08:30:00.000Z"],[5,3650,3650,"2036-01-13T08:30:00.000Z"]];

test("red line: the live scheduler's outputs are unchanged (golden matrix)", () => {
  for (const [quality, previousIntervalDays, intervalDays, dueAt] of GOLDEN) {
    const plan = nextReviewDate({
      reviewedAt: "2026-01-15T08:30:00.000Z", quality, previousIntervalDays
    });
    assert.equal(plan.intervalDays, intervalDays,
      "quality " + quality + " prev " + previousIntervalDays);
    assert.equal(plan.dueAt, dueAt);
  }
});

// ---- UI wiring: the real legacy-app segments in a vm ----
// Same assembly as test/migration-registry.test.js (recorder block +
// storage segment), plus the review section for the end-to-end run,
// mirroring scripts/validate-review-recheck.cjs.

const appSource = fs.readFileSync(new URL("../assets/js/legacy-app.js", import.meta.url), "utf8");
const htmlSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8") + "\n" + appSource;
const blockStart = appSource.indexOf("var ERROR_EVENT_LOG_KEY");
const blockEnd = appSource.indexOf("/* ---------------- 错误事件账结束 ---------------- */", blockStart);
const errorBlock = appSource.slice(blockStart, blockEnd);
const segStart = htmlSource.indexOf("var storageRecoveryRequired = false;");
const segEnd = htmlSource.indexOf("\n/* ==========================================\n   知识卡片", segStart);
const storageSegment = htmlSource.slice(segStart, segEnd);
const reviewStart = appSource.indexOf("var reviewSchedulerPromise = null;");
const reviewEnd = appSource.indexOf("\n/* ==========================================\n   竞赛", reviewStart);
const reviewSegment = appSource.slice(reviewStart, reviewEnd);
assert.ok(blockStart >= 0 && blockEnd > blockStart && segStart >= 0 && segEnd > segStart &&
  reviewStart >= 0 && reviewEnd > reviewStart, "all segments must be extractable");

const KEY = {
  wrong: "a_w_v6", record: "a_r_v6", days: "a_d_v6", qstats: "a_q_v6",
  ai: "a_ai_v6", prefs: "a_prefs_v6", practice: "a_active_practice_v1", graduated: "a_g_v6"
};
const SHADOW_KEY = "a_fsrs_shadow_v1";

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

function makeContext(storage, withReview = false) {
  const listeners = {};
  const sandbox = {
    localStorage: storage, listeners,
    window: { addEventListener(type, listener) { listeners[type] = listener; } },
    console: { warn() {}, error() {} },
    alert() {}, showLocalFileNotice() {},
    KEY
  };
  vm.runInNewContext(
    "var ATTEMPT_LOG_KEY='a_attempts_v1'; var ATTEMPT_LOG_LIMIT=2000;\n" +
    "var FSRS_SHADOW_KEY='a_fsrs_shadow_v1'; var FSRS_SHADOW_LIMIT=2000; var FSRS_SHADOW_MIN_SAMPLE=30;\n" +
    errorBlock + "\n" + storageSegment + (withReview ? "\n" + reviewSegment : "") +
    "\nthis.api={Store,readFsrsShadowLog,appendFsrsShadowLog,summarizeFsrsShadowDivergence," +
    (withReview ? "recordQuestionOutcome,injectDomain:function(m){reviewSchedulerPromise=Promise.resolve(m);}," : "") +
    "get locked(){return storageRecoveryRequired;}};",
    sandbox
  );
  return sandbox.api;
}

test("ui wiring: shadow append/read round-trip in its own key, cap rolls", () => {
  const { data, storage } = mapStorage({});
  const api = makeContext(storage);
  assert.equal(api.appendFsrsShadowLog(validRecord()), true);
  const log = api.readFsrsShadowLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].id, "q1");
  assert.ok(data.has(SHADOW_KEY));
  const seeded = [];
  for (let i = 0; i < 2000; i++) seeded.push(validRecord({ at: T0 + i }));
  const full = mapStorage({ [SHADOW_KEY]: JSON.stringify(seeded) });
  const api2 = makeContext(full.storage);
  assert.equal(api2.appendFsrsShadowLog(validRecord({ at: T0 + 99999, id: "newest" })), true);
  const rolled = api2.readFsrsShadowLog();
  assert.equal(rolled.length, 2000);
  assert.equal(rolled[rolled.length - 1].id, "newest");
});

test("ui wiring: corrupt shadow bytes are preserved and lock nothing", () => {
  const garbage = "[{\"id\":\"q1\",";
  const { data, storage } = mapStorage({ [SHADOW_KEY]: garbage });
  const api = makeContext(storage);
  assert.equal(api.readFsrsShadowLog(), null);
  assert.equal(api.appendFsrsShadowLog(validRecord()), false,
    "append must refuse rather than overwrite corrupt bytes");
  assert.equal(data.get(SHADOW_KEY), garbage, "corrupt shadow bytes stay verbatim");
  assert.equal(api.locked, false, "a corrupt shadow log must never lock the main flow");
  assert.equal(api.Store.getWrong().length, 0, "primary ledgers stay fully usable");
  assert.equal(api.Store.addWrong("q9"), true, "primary ledgers stay writable");
});

test("ui wiring: the segment summary mirror agrees with the domain summary", () => {
  const { storage } = mapStorage({});
  const api = makeContext(storage);
  const records = [
    validRecord({ fsrsIntervalDays: 11, liveIntervalDays: 5 }),
    validRecord({ fsrsIntervalDays: 2, liveIntervalDays: 6 }),
    validRecord({ liveAction: "graduate", liveIntervalDays: null })
  ];
  // JSON round-trip: the vm mirror's result lives in another realm,
  // so deepStrictEqual would fail on prototypes alone.
  assert.deepEqual(JSON.parse(JSON.stringify(api.summarizeFsrsShadowDivergence(records))),
    summarizeFsrsShadowDivergence(records));
});

test("ui wiring end-to-end: scheduling is unchanged and one shadow record lands per outcome", async () => {
  const domain = await import("../src/domain/index.js");
  const { data, storage } = mapStorage({});
  const api = makeContext(storage, true);
  api.injectDomain(domain);
  // First wrong answer: live scheduler assigns 1 day (golden path),
  // FSRS rates it Again (rating 1) from the same revlog input.
  await api.recordQuestionOutcome("p001", false);
  const wrong = api.Store.getWrong();
  assert.equal(wrong.length, 1);
  assert.equal(wrong[0].intervalDays, 1, "live scheduling must be the pre-shadow behaviour");
  let shadow = JSON.parse(data.get(SHADOW_KEY));
  assert.equal(shadow.length, 1);
  assert.equal(shadow[0].id, "p001");
  assert.equal(shadow[0].rating, 1);
  assert.equal(shadow[0].liveIntervalDays, 1);
  assert.equal(shadow[0].liveAction, "schedule");
  assert.equal(shadow[0].fsrsIntervalDays, 1);
  assert.equal(shadow[0].historyCount, 1);
  // A correct answer next: live plan doubles-and-a-half from 1 -> 3
  // days at quality 4 (golden), FSRS replays both rated attempts.
  await api.recordQuestionOutcome("p001", true);
  assert.equal(api.Store.getWrong()[0].intervalDays, 3);
  shadow = JSON.parse(data.get(SHADOW_KEY));
  assert.equal(shadow.length, 2);
  assert.equal(shadow[1].rating, 3, "quality 4 maps to FSRS rating 3 (Good)");
  assert.equal(shadow[1].liveIntervalDays, 3);
  assert.equal(shadow[1].historyCount, 2);
});


test("append: duplicate delivery for the same card and review timestamp is idempotent", () => {
  const first = validRecord({ id: "same-card", at: T0, rating: 3, fsrsIntervalDays: 11 });
  const retried = validRecord({ id: "same-card", at: T0, rating: 4, fsrsIntervalDays: 19 });
  const distinctReview = validRecord({ id: "same-card", at: T0 + DAY, rating: 3 });
  const once = appendFsrsShadowRecord([], first);
  const twice = appendFsrsShadowRecord(once, retried);
  const three = appendFsrsShadowRecord(twice, distinctReview);
  assert.equal(twice.length, 1);
  assert.equal(twice[0].rating, 4);
  assert.equal(twice[0].fsrsIntervalDays, 19);
  assert.equal(three.length, 2);
  assert.deepEqual(three.map(record => record.at), [T0, T0 + DAY]);
});
