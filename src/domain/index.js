export function gradeAnswer({ expectedAnswer, submittedAnswer, evidenceStatus }) {
  if (typeof expectedAnswer !== "string" || !expectedAnswer.trim()) throw new TypeError("expectedAnswer is required");
  if (typeof submittedAnswer !== "string") throw new TypeError("submittedAnswer must be a string");
  if (expectedAnswer.length > 10000 || submittedAnswer.length > 10000) {
    throw new RangeError("answers must not exceed 10000 characters");
  }

  // Bound attacker-controlled strings before scanning for control characters.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(expectedAnswer) ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(submittedAnswer)) {
    throw new TypeError("answers must not contain non-whitespace control characters");
  }
  if (!["verified","review-needed","draft"].includes(evidenceStatus)) throw new RangeError("invalid evidence status");
  // Normalize canonically equivalent Unicode and use locale-independent casing so
  // answer keys behave identically across browsers and user locale settings.
  const normalizeAnswer = value => value.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase();
  const normalizedExpected = normalizeAnswer(expectedAnswer);
  const normalizedSubmitted = normalizeAnswer(submittedAnswer);
  if (normalizedExpected.length > 10000 || normalizedSubmitted.length > 10000) throw new RangeError("normalized answers must not exceed 10000 characters");
  const correct = normalizedSubmitted === normalizedExpected;
  return Object.freeze({ correct, score:correct ? 1 : 0, evidenceStatus, feedback: evidenceStatus === "verified" ? (correct ? "回答正确" : "再检查关键概念") : "本题答案尚未完成来源审核，评分仅供练习参考" });
}
function parseReviewTimestamp(value) {
  if (typeof value !== "string") {
    throw new TypeError("reviewedAt must be an ISO timestamp with an explicit timezone");
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) throw new TypeError("reviewedAt must be an ISO timestamp with an explicit timezone");
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw new TypeError("reviewedAt contains an invalid calendar date");
  }
  if (match[7] !== "Z") {
    const hour = Number(match[9]), minute = Number(match[10]);
    if (minute > 59 || hour > 14 || (hour === 14 && minute !== 0) ||
        (match[8] === "-" && hour === 0 && minute === 0)) {
      throw new TypeError("reviewedAt contains an invalid or unknown timezone offset");
    }
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError("reviewedAt must be a valid timestamp");
  const yearUTC = new Date(timestamp).getUTCFullYear();
  if (yearUTC < 0 || yearUTC > 9999) throw new RangeError("reviewedAt normalizes outside the supported UTC year range");
  return timestamp;
}

// FSRS review-log (revlog) support. The scheduler above stays the only
// scheduling authority; the helpers below only describe review events in the
// shape the FSRS optimizer consumes (card_id / review_time / review_rating /
// review_state / review_duration, per the ts-fsrs optimizer documentation),
// so accumulated history can later be replayed and fitted offline.
export function fsrsRatingFromQuality(quality) {
  if (!Number.isSafeInteger(quality) || quality < 0 || quality > 5) {
    throw new RangeError("quality must be an integer from 0 to 5");
  }
  // SM-2 style quality -> FSRS rating: a failed recall (quality 0-2) is
  // "Again" (1); 3 was correct with difficulty -> "Hard" (2);
  // 4 -> "Good" (3); 5 -> "Easy" (4).
  return quality <= 2 ? 1 : quality === 3 ? 2 : quality === 4 ? 3 : 4;
}

export function buildReviewEvent({ cardId, reviewedAtMs, quality, reviewState, reviewDurationMs }) {
  if (typeof cardId !== "string" || !cardId.trim() || cardId.length > 120) {
    throw new TypeError("cardId must be a non-empty string of at most 120 characters");
  }
  if (!Number.isSafeInteger(reviewedAtMs) || reviewedAtMs < 0) {
    throw new RangeError("reviewedAtMs must be a safe integer epoch millisecond timestamp");
  }
  const reviewRating = fsrsRatingFromQuality(quality);
  if (!Number.isSafeInteger(reviewState) || reviewState < 0 || reviewState > 3) {
    throw new RangeError("reviewState must be an integer from 0 to 3");
  }
  const event = {
    card_id: cardId,
    review_time: reviewedAtMs,
    review_rating: reviewRating,
    review_state: reviewState
  };
  if (reviewDurationMs !== undefined) {
    if (!Number.isSafeInteger(reviewDurationMs) || reviewDurationMs < 0) {
      throw new RangeError("reviewDurationMs must be a safe integer of milliseconds");
    }
    event.review_duration = reviewDurationMs;
  }
  return Object.freeze(event);
}

function csvCell(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function revlogCsvFromAttemptLog(attempts) {
  if (!Array.isArray(attempts)) throw new TypeError("attempts must be an array");
  const lines = ["review_time,card_id,review_rating,review_duration,review_state"];
  let includedCount = 0;
  let skippedCount = 0;
  for (const entry of attempts) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError("attempt entries must be records");
    }
    // Entries written before the revlog fields existed carry no rating/state;
    // they are skipped, never reconstructed or guessed.
    if (entry.rating === undefined && entry.fsrsState === undefined) {
      skippedCount++;
      continue;
    }
    const event = buildReviewEvent({
      cardId: entry.id,
      reviewedAtMs: entry.at,
      quality: entry.quality,
      reviewState: entry.fsrsState
    });
    if (event.review_rating !== entry.rating) {
      throw new RangeError("attempt entry rating does not match its quality");
    }
    lines.push([
      csvCell(event.review_time),
      csvCell(event.card_id),
      csvCell(event.review_rating),
      "",
      csvCell(event.review_state)
    ].join(","));
    includedCount++;
  }
  return Object.freeze({ csv: lines.join("\n") + "\n", includedCount, skippedCount });
}

export function nextReviewDate({ reviewedAt, quality, previousIntervalDays = 0 }) {
  const reviewedTimestamp = parseReviewTimestamp(reviewedAt);
  if (!Number.isSafeInteger(quality) || quality < 0 || quality > 5) {
    throw new RangeError("quality must be an integer from 0 to 5");
  }
  if (!Number.isSafeInteger(previousIntervalDays) || previousIntervalDays < 0 || previousIntervalDays > 3650) {
    throw new RangeError("previousIntervalDays must be a safe integer from 0 to 3650");
  }
  const interval = quality < 3 ? 1 : previousIntervalDays === 0 ? 1
    : Math.min(3650, Math.max(1, Math.round(previousIntervalDays * (quality >= 4 ? 2.5 : 1.5))));
  const due = new Date(reviewedTimestamp + interval * 86400000);
  if (!Number.isFinite(due.getTime()) || due.getUTCFullYear() < 0 || due.getUTCFullYear() > 9999) {
    throw new RangeError("review due date is outside the supported UTC year range");
  }
  return Object.freeze({ intervalDays:interval, dueAt:due.toISOString() });
}

/* ------------------------------------------------------------------
 * FSRS shadow mode (follows the revlog above: revlog landed first,
 * at 19765f7a, because the order cannot be swapped — evidence before
 * any switch). Switching the live scheduler to FSRS is NOT approved;
 * this section only computes what FSRS-5 WOULD suggest, so divergence
 * evidence can accumulate for that future decision. Nothing here is
 * ever read by the scheduling path: nextReviewDate stays the only
 * scheduling authority, and a shadow record is written only after
 * the live plan for a review has already been applied.
 *
 * Why self-implemented instead of vendored ts-fsrs: ts-fsrs ships as
 * a multi-module TypeScript npm package and this app is a no-build
 * static site, so there is no honest single-file vendoring path.
 * The formulas below follow the public FSRS-5 algorithm as published
 * in the open-spaced-repetition awesome-fsrs wiki ("The Algorithm":
 * FSRS-5 section, with the remaining formulas inherited from
 * FSRS-4.5), using the published default weights and a target
 * retention of 0.9. This is a SHADOW ESTIMATE: the parameters are
 * public defaults, never fitted to this learner's data (no
 * review_duration or any other field without an honest source is
 * recorded), and results must be presented as estimates, not as a
 * fitted model's verdict.
 *
 * Replay model: a card's FSRS state is rebuilt from its rated
 * attempt-log entries (the revlog fields above), in log order.
 * Legacy entries without a rating cannot be replayed and are the
 * caller's job to filter out; elapsed time is the wall-clock gap
 * between consecutive rated reviews, so same-day reviews (< 1 day)
 * take the FSRS-5 short-term stability branch.
 * ------------------------------------------------------------------ */

export const FSRS_SHADOW_MODEL = "FSRS-5";
export const FSRS_SHADOW_REQUEST_RETENTION = 0.9;
export const FSRS_SHADOW_DEFAULT_WEIGHTS = Object.freeze([
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621
]);
// Same rolling cap as the attempt log: one shadow record per scored
// review the live scheduler acted on, oldest first off the end.
export const FSRS_SHADOW_LOG_LIMIT = 2000;
// A divergence summary below this many comparable records reports
// "insufficient sample" and draws no conclusion.
export const FSRS_SHADOW_MIN_SAMPLE = 30;
export const FSRS_SHADOW_DECLARED_VERSION = 1;
const FSRS_SHADOW_MAX_INTERVAL_DAYS = 36500;
const FSRS_SHADOW_MIN_STABILITY = 0.01;
const FSRS_SHADOW_MAX_STABILITY = 36500;
const FSRS_CURVE_FACTOR = 19 / 81;
const FSRS_CURVE_DECAY = -0.5;

function clampFsrsShadow(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundFsrsShadow(value) {
  return Math.round(value * 1e6) / 1e6;
}

function assertFsrsRating(rating) {
  if (!Number.isSafeInteger(rating) || rating < 1 || rating > 4) {
    throw new RangeError("rating must be an integer from 1 to 4");
  }
}

function assertFsrsState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state) ||
      !Number.isFinite(state.stability) || state.stability <= 0 ||
      !Number.isFinite(state.difficulty) || state.difficulty < 1 || state.difficulty > 10) {
    throw new TypeError("state must be { stability > 0, difficulty within [1, 10] }");
  }
}

export function fsrsShadowRetrievability(elapsedDays, stability) {
  if (!Number.isFinite(elapsedDays) || elapsedDays < 0) {
    throw new RangeError("elapsedDays must be a finite number >= 0");
  }
  if (!Number.isFinite(stability) || stability <= 0) {
    throw new RangeError("stability must be a finite number > 0");
  }
  return Math.pow(1 + FSRS_CURVE_FACTOR * (elapsedDays / stability), FSRS_CURVE_DECAY);
}

export function fsrsShadowInitialDifficulty(rating) {
  assertFsrsRating(rating);
  const w = FSRS_SHADOW_DEFAULT_WEIGHTS;
  return clampFsrsShadow(w[4] - Math.exp(w[5] * (rating - 1)) + 1, 1, 10);
}

export function fsrsShadowInitialState(rating) {
  assertFsrsRating(rating);
  return Object.freeze({
    stability: FSRS_SHADOW_DEFAULT_WEIGHTS[rating - 1],
    difficulty: fsrsShadowInitialDifficulty(rating)
  });
}

// FSRS-5 difficulty update: linear damping, then mean reversion
// toward D0(4) (the FSRS-5 change; earlier versions reverted to
// D0(3)).
export function fsrsShadowNextDifficulty(difficulty, rating) {
  if (!Number.isFinite(difficulty) || difficulty < 1 || difficulty > 10) {
    throw new RangeError("difficulty must be a finite number within [1, 10]");
  }
  assertFsrsRating(rating);
  const w = FSRS_SHADOW_DEFAULT_WEIGHTS;
  const damped = difficulty + (-w[6] * (rating - 3)) * ((10 - difficulty) / 9);
  return clampFsrsShadow(w[7] * fsrsShadowInitialDifficulty(4) + (1 - w[7]) * damped, 1, 10);
}

export function fsrsShadowNextState(state, rating, elapsedDays) {
  assertFsrsState(state);
  assertFsrsRating(rating);
  if (!Number.isFinite(elapsedDays) || elapsedDays < 0) {
    throw new RangeError("elapsedDays must be a finite number >= 0");
  }
  const w = FSRS_SHADOW_DEFAULT_WEIGHTS;
  const difficulty = fsrsShadowNextDifficulty(state.difficulty, rating);
  let stability;
  if (elapsedDays < 1) {
    // FSRS-5 same-day (short-term) stability.
    stability = state.stability * Math.exp(w[17] * (rating - 3 + w[18]));
  } else if (rating === 1) {
    // Post-lapse stability (FSRS-4.5 formula, inherited by FSRS-5).
    const r = fsrsShadowRetrievability(elapsedDays, state.stability);
    stability = w[11] * Math.pow(difficulty, -w[12]) *
      (Math.pow(state.stability + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  } else {
    // Stability after a successful recall, with the Hard penalty
    // (rating 2) and Easy bonus (rating 4) factors.
    const r = fsrsShadowRetrievability(elapsedDays, state.stability);
    const hardFactor = rating === 2 ? w[15] : 1;
    const easyFactor = rating === 4 ? w[16] : 1;
    stability = state.stability * (
      Math.exp(w[8]) * (11 - difficulty) * Math.pow(state.stability, -w[9]) *
      (Math.exp(w[10] * (1 - r)) - 1) * hardFactor * easyFactor + 1
    );
  }
  return Object.freeze({
    stability: clampFsrsShadow(stability, FSRS_SHADOW_MIN_STABILITY, FSRS_SHADOW_MAX_STABILITY),
    difficulty
  });
}

export function fsrsShadowIntervalDays(stability, retention = FSRS_SHADOW_REQUEST_RETENTION) {
  if (!Number.isFinite(stability) || stability <= 0) {
    throw new RangeError("stability must be a finite number > 0");
  }
  if (!Number.isFinite(retention) || retention <= 0 || retention >= 1) {
    throw new RangeError("retention must be a finite number strictly between 0 and 1");
  }
  const raw = (stability / FSRS_CURVE_FACTOR) * (Math.pow(retention, 1 / FSRS_CURVE_DECAY) - 1);
  return clampFsrsShadow(Math.round(raw), 1, FSRS_SHADOW_MAX_INTERVAL_DAYS);
}

// Replay one card's rated reviews ([{ at, rating }], chronological,
// at = epoch ms) through FSRS-5. Pure. Returns null for an empty
// history; otherwise the state after the last review, the interval
// FSRS would schedule from it, and the last review's elapsed days
// (null when the history has a single review).
export function replayFsrsShadow(reviews) {
  if (!Array.isArray(reviews)) throw new TypeError("reviews must be an array");
  let state = null;
  let lastAt = null;
  let lastElapsedDays = null;
  for (const review of reviews) {
    if (!review || typeof review !== "object" || Array.isArray(review)) {
      throw new TypeError("reviews entries must be records");
    }
    if (!Number.isSafeInteger(review.at) || review.at < 0) {
      throw new RangeError("review at must be a safe integer epoch millisecond timestamp");
    }
    assertFsrsRating(review.rating);
    if (state === null) {
      state = fsrsShadowInitialState(review.rating);
      lastElapsedDays = null;
    } else {
      const elapsedDays = (review.at - lastAt) / 86400000;
      if (!(elapsedDays >= 0)) {
        throw new RangeError("reviews must be in chronological order");
      }
      state = fsrsShadowNextState(state, review.rating, elapsedDays);
      lastElapsedDays = elapsedDays;
    }
    lastAt = review.at;
  }
  if (state === null) return null;
  return Object.freeze({
    state,
    intervalDays: fsrsShadowIntervalDays(state.stability),
    reviewCount: reviews.length,
    lastElapsedDays: lastElapsedDays === null ? null : roundFsrsShadow(lastElapsedDays)
  });
}

const FSRS_SHADOW_RECORD_KEYS = Object.freeze([
  "id", "at", "rating", "liveIntervalDays", "liveAction",
  "fsrsIntervalDays", "stability", "difficulty", "elapsedDays", "historyCount"
]);

// One shadow record: the live scheduler's outcome for a review and
// the FSRS suggestion computed from the same revlog input, side by
// side. liveAction "schedule" carries the interval the live
// scheduler actually assigned; "graduate" (third consecutive correct
// answer removes the card from the wrong book into the +14d/+45d
// recheck track) has no live interval — liveIntervalDays is null and
// the record is excluded from divergence statistics, never compared
// against a number the scheduler did not produce.
export function isFsrsShadowRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== FSRS_SHADOW_RECORD_KEYS.length ||
      !FSRS_SHADOW_RECORD_KEYS.every(key => Object.prototype.hasOwnProperty.call(value, key))) {
    return false;
  }
  if (typeof value.id !== "string" || !value.id.trim() || value.id.length > 120) return false;
  if (!Number.isSafeInteger(value.at) || value.at < 0) return false;
  if (!Number.isSafeInteger(value.rating) || value.rating < 1 || value.rating > 4) return false;
  if (!["schedule", "graduate"].includes(value.liveAction)) return false;
  if (value.liveAction === "schedule") {
    if (!Number.isSafeInteger(value.liveIntervalDays) ||
        value.liveIntervalDays < 1 || value.liveIntervalDays > 3650) return false;
  } else if (value.liveIntervalDays !== null) return false;
  if (!Number.isSafeInteger(value.fsrsIntervalDays) ||
      value.fsrsIntervalDays < 1 || value.fsrsIntervalDays > FSRS_SHADOW_MAX_INTERVAL_DAYS) return false;
  if (!Number.isFinite(value.stability) || value.stability <= 0 ||
      value.stability > FSRS_SHADOW_MAX_STABILITY) return false;
  if (!Number.isFinite(value.difficulty) || value.difficulty < 1 || value.difficulty > 10) return false;
  if (!(value.elapsedDays === null ||
        (Number.isFinite(value.elapsedDays) && value.elapsedDays >= 0))) return false;
  if (!Number.isSafeInteger(value.historyCount) || value.historyCount < 1) return false;
  return true;
}

export function buildFsrsShadowRecord({ cardId, reviewedAtMs, rating, liveIntervalDays, liveAction, reviews }) {
  if (typeof cardId !== "string" || !cardId.trim() || cardId.length > 120) {
    throw new TypeError("cardId must be a non-empty string of at most 120 characters");
  }
  if (!Number.isSafeInteger(reviewedAtMs) || reviewedAtMs < 0) {
    throw new RangeError("reviewedAtMs must be a safe integer epoch millisecond timestamp");
  }
  assertFsrsRating(rating);
  if (!["schedule", "graduate"].includes(liveAction)) {
    throw new RangeError("liveAction must be \"schedule\" or \"graduate\"");
  }
  if (liveAction === "schedule") {
    if (!Number.isSafeInteger(liveIntervalDays) || liveIntervalDays < 1 || liveIntervalDays > 3650) {
      throw new RangeError("liveIntervalDays must be a safe integer from 1 to 3650 for a scheduled review");
    }
  } else if (liveIntervalDays !== null) {
    throw new RangeError("liveIntervalDays must be null for a graduation outcome");
  }
  const replay = replayFsrsShadow(reviews);
  if (replay === null) {
    throw new RangeError("reviews must contain at least the current review");
  }
  const last = reviews[reviews.length - 1];
  if (last.at !== reviewedAtMs || last.rating !== rating) {
    throw new RangeError("the last review must be the current review being recorded");
  }
  const record = {
    id: cardId,
    at: reviewedAtMs,
    rating,
    liveIntervalDays,
    liveAction,
    fsrsIntervalDays: replay.intervalDays,
    stability: roundFsrsShadow(replay.state.stability),
    difficulty: roundFsrsShadow(replay.state.difficulty),
    elapsedDays: replay.lastElapsedDays,
    historyCount: replay.reviewCount
  };
  if (!isFsrsShadowRecord(record)) {
    throw new RangeError("built shadow record does not satisfy the record shape");
  }
  return Object.freeze(record);
}

// Append one record. Pure: returns a new array, never mutates the
// input; invalid stored entries are dropped on append (the log is
// derived data, replayable from the attempt log), and the rolling
// cap matches the attempt log's 2000.
export function appendFsrsShadowRecord(records, record) {
  if (!Array.isArray(records)) throw new TypeError("records must be an array");
  if (!isFsrsShadowRecord(record)) throw new TypeError("record must be a valid FSRS shadow record");
  // A UI retry or duplicate event delivery for the same card and millisecond
  // must not inflate the offline comparison sample. Replace that event's
  // shadow projection while preserving every distinct review occurrence.
  const next = records
    .filter(isFsrsShadowRecord)
    .filter(existing => existing.id !== record.id || existing.at !== record.at);
  next.push(record);
  return next.length > FSRS_SHADOW_LOG_LIMIT
    ? next.slice(next.length - FSRS_SHADOW_LOG_LIMIT)
    : next;
}

// Divergence summary over the comparable records (liveAction
// "schedule" only). Deltas are fsrsIntervalDays - liveIntervalDays.
// Below FSRS_SHADOW_MIN_SAMPLE comparable records the summary still
// reports the counts it has but flags sufficient=false — callers
// must present that as "insufficient sample", not as a conclusion.
export function summarizeFsrsShadowDivergence(records) {
  if (!Array.isArray(records)) throw new TypeError("records must be an array");
  const valid = records.filter(isFsrsShadowRecord);
  const deltas = valid
    .filter(record => record.liveAction === "schedule")
    .map(record => record.fsrsIntervalDays - record.liveIntervalDays)
    .sort((a, b) => a - b);
  const comparedCount = deltas.length;
  const fsrsLongerCount = deltas.filter(delta => delta > 0).length;
  const fsrsShorterCount = deltas.filter(delta => delta < 0).length;
  const equalCount = comparedCount - fsrsLongerCount - fsrsShorterCount;
  const share = count => comparedCount === 0 ? null : roundFsrsShadow(count / comparedCount);
  return Object.freeze({
    totalRecords: valid.length,
    comparedCount,
    meanDeltaDays: comparedCount === 0 ? null
      : roundFsrsShadow(deltas.reduce((sum, delta) => sum + delta, 0) / comparedCount),
    medianDeltaDays: comparedCount === 0 ? null
      : comparedCount % 2 === 1
        ? deltas[(comparedCount - 1) / 2]
        : roundFsrsShadow((deltas[comparedCount / 2 - 1] + deltas[comparedCount / 2]) / 2),
    fsrsLongerCount,
    fsrsShorterCount,
    equalCount,
    fsrsLongerShare: share(fsrsLongerCount),
    fsrsShorterShare: share(fsrsShorterCount),
    equalShare: share(equalCount),
    minSample: FSRS_SHADOW_MIN_SAMPLE,
    sufficient: comparedCount >= FSRS_SHADOW_MIN_SAMPLE
  });
}

/* ------------------------------------------------------------------
 * Local error event log (wave 4, item 4 — replicated from the
 * Human-Digital-Twin-Health pilot, main b094c4ee, with kinds and
 * context re-derived from this app's own failure paths).
 *
 * The model is borrowed from Sentry — structured events with a type,
 * a timestamp, a small context summary and fingerprint-based
 * grouping with counts — but nothing ever leaves the device: events
 * are appended to a localStorage-backed list owned by the UI layer
 * and leave only inside a user-triggered export file attached to a
 * support report. Before this log existed, every failure below was a
 * transient alert or a console line; a user reporting a problem had
 * nothing to show.
 *
 * Privacy discipline (structural, not by convention):
 * - `kind` is a closed set of failure-path identifiers, never free
 *   text from data.
 * - `context` passes through a key whitelist and scalar-only filter:
 *   stage labels, the error's class name, which storage class was
 *   involved, row counts, file sizes, pool counts, booleans.
 *   Question text, submitted answers, session labels and question
 *   ids have no whitelisted key to travel through, so they cannot
 *   enter an event; there is deliberately no generic "source"/
 *   "detail"/"id"/"label" key.
 * - `message` is the application's own static wording per kind,
 *   truncated; callers never pass data-derived text as the message.
 *
 * Aggregation: events sharing a fingerprint (kind + errorName +
 * stage) merge into one entry with a count and first/last
 * timestamps, so a recurring failure stays one line. The list is
 * capped at ERROR_EVENT_LOG_MAX_EVENTS distinct fingerprints,
 * oldest-first rolling (the same append-with-cap discipline as the
 * attempt log; the numeric cap is 200).
 * ------------------------------------------------------------------ */

export const ERROR_EVENT_LOG_SCHEMA_VERSION = 1;
export const ERROR_EVENT_LOG_STORAGE_KIND = "local-browser-error-log";
export const ERROR_EVENT_LOG_MAX_EVENTS = 200;

export const ERROR_EVENT_KINDS = Object.freeze([
  "recovery_locked",
  "attempt_log_locked",
  "storage_fault",
  "save_failed",
  "export_failed",
  "session_rejected"
]);

const errorEventKindSet = new Set(ERROR_EVENT_KINDS);

// The only context keys an event may carry. Anything else the caller
// passes is dropped here, in the domain layer, regardless of caller.
const ERROR_EVENT_CONTEXT_KEYS = Object.freeze([
  "stage", "errorName", "storageKind",
  "rowCount", "fileSizeBytes", "poolCount", "childMode", "preserved", "fallback"
]);
const errorEventContextKeySet = new Set(ERROR_EVENT_CONTEXT_KEYS);

function sanitizeErrorEventContext(context) {
  const clean = {};
  if (!context || typeof context !== "object" || Array.isArray(context)) return clean;
  for (const key of ERROR_EVENT_CONTEXT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(context, key)) continue;
    const value = context[key];
    if (typeof value === "string") clean[key] = value.slice(0, 64);
    else if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === "boolean") clean[key] = value;
  }
  return clean;
}

export function errorEventFingerprint(kind, context) {
  const clean = sanitizeErrorEventContext(context);
  const parts = [kind, clean.errorName || "", clean.stage || ""];
  return parts.map(part => String(part).toLowerCase()).join("|");
}

function errorEventId(fingerprint, at) {
  let hash = 5381;
  for (let i = 0; i < fingerprint.length; i++) {
    hash = ((hash << 5) + hash + fingerprint.charCodeAt(i)) >>> 0;
  }
  return "err-" + hash.toString(16) + "-" + String(Date.parse(at) || 0);
}

export function buildErrorEvent(input, at) {
  if (!input || typeof input !== "object") throw new TypeError("error event input must be an object");
  if (!errorEventKindSet.has(input.kind)) {
    throw new TypeError("unsupported error event kind: " + String(input.kind));
  }
  const timestamp = typeof at === "string" && Number.isFinite(Date.parse(at)) ? at : new Date().toISOString();
  const context = sanitizeErrorEventContext(input.context);
  const fingerprint = errorEventFingerprint(input.kind, context);
  return {
    id: errorEventId(fingerprint, timestamp),
    at: timestamp,
    lastAt: timestamp,
    kind: input.kind,
    message: typeof input.message === "string" ? input.message.slice(0, 240) : "",
    fingerprint,
    count: 1,
    context
  };
}

function isErrorEvent(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    errorEventKindSet.has(value.kind) &&
    typeof value.fingerprint === "string" && value.fingerprint.length > 0 &&
    typeof value.at === "string" && Number.isFinite(Date.parse(value.at)) &&
    Number.isInteger(value.count) && value.count >= 1;
}

// Append one failure to the log. Pure: returns a new array, never
// mutates the input list or its events. A repeat of an existing
// fingerprint increments that entry's count and lastAt instead of
// adding a row; once the cap is reached the oldest entries roll off.
export function appendErrorEvent(events, input, at) {
  if (!Array.isArray(events)) throw new TypeError("error event log must be an array");
  const event = buildErrorEvent(input, at);
  const existing = events.filter(isErrorEvent);
  const index = existing.findIndex(entry => entry.fingerprint === event.fingerprint);
  let next;
  if (index >= 0) {
    const merged = {
      ...existing[index],
      lastAt: event.at,
      message: event.message || existing[index].message,
      count: existing[index].count + 1
    };
    next = [...existing.slice(0, index), merged, ...existing.slice(index + 1)];
  } else {
    next = [...existing, event];
  }
  if (next.length > ERROR_EVENT_LOG_MAX_EVENTS) {
    next = next.slice(next.length - ERROR_EVENT_LOG_MAX_EVENTS);
  }
  return next;
}

export function summarizeErrorEvents(events) {
  if (!Array.isArray(events)) throw new TypeError("error event log must be an array");
  return events.filter(isErrorEvent)
    .map(entry => ({
      fingerprint: entry.fingerprint,
      kind: entry.kind,
      count: entry.count,
      firstAt: entry.at,
      lastAt: entry.lastAt
    }))
    .sort((a, b) => b.count - a.count || String(a.fingerprint).localeCompare(String(b.fingerprint)));
}

export function buildErrorLogExport(events, exportedAt) {
  if (!Array.isArray(events)) throw new TypeError("error event log must be an array");
  const clean = events.filter(isErrorEvent);
  return {
    schemaVersion: ERROR_EVENT_LOG_SCHEMA_VERSION,
    exportedAt,
    storage: ERROR_EVENT_LOG_STORAGE_KIND,
    eventCount: clean.length,
    totalOccurrences: clean.reduce((sum, entry) => sum + entry.count, 0),
    groups: summarizeErrorEvents(clean),
    events: clean
  };
}

/* ------------------------------------------------------------------ *
 * Data migration registry (wave 4, item 2; spec:
 * data-migration-registry-spec-v1, after the EKPO and Health pilots).
 *
 * Audit of this app's local data (2026-11-25, against the spec's nine
 * invariants) found a different shape from the pilots: there is no
 * single ledger object. Nine datasets live under nine frozen keys,
 * each stored as a bare array/object, and exactly one of them — the
 * active practice session — carries a version field inside the data.
 * Every other dataset's "version" existed only as the suffix of its
 * key name (a_w_v6, a_attempts_v1, ...), which is precisely the
 * key-name versioning the spec retires. The gaps and their closures:
 *
 * - No registry: the baselines below are now DECLARED here, per
 *   dataset, the way EKPO declared its v9 baseline from its key era.
 *   The declared number is a human-audited constant; no code parses a
 *   key-name suffix at runtime, and key names are frozen as-is.
 * - Scattered check: the practice session's `version !== 1` strict
 *   equality sat open-coded inside the UI shape probe, and a payload
 *   stamped with a HIGHER version failed exactly like corruption —
 *   rejected, yes (writes lock, bytes preserved), but
 *   indistinguishable from damage. classifyPracticeSessionVersion is
 *   the single judgement now; the UI storage segment mirrors it (the
 *   segment cannot import this module — it must run before the lazy
 *   import resolves and validators extract it into a vm without one)
 *   and records an explicit unsupported-version event, while the
 *   reject/lock behaviour itself is unchanged.
 * - No trace: classification results carry the spec's
 *   { loadedVersion, migratedFrom } pair. For unversioned datasets the
 *   loaded version is by definition the declared baseline once the
 *   dataset's shape probe passes, and migratedFrom is always null —
 *   no dataset has a second generation, so every migration chain is
 *   EMPTY (a legal registry state, as in the Health pilot). Do not
 *   invent steps here; a future shape change registers one step, one
 *   fixture pair, and bumps the declared version, in that order.
 *
 * What the audit found already compliant, and this registry therefore
 * only names: every load runs the dataset's shape probe and fails
 * closed (mismatch locks writes, original bytes preserved, zero
 * writes on the load path); the attempt log's pre-FSRS entries are a
 * legacy entry shape the probe deliberately admits beside current
 * entries (the revlog semantics are untouched by this registry); the
 * recovery packet is export-only verbatim raw bytes with no import
 * path to gate. The question-evidence manifest is a bundled asset,
 * not user data — its schemaVersion check ships with the app and is
 * out of this registry's scope.
 * ------------------------------------------------------------------ */

// Declared dataset versions. PRIMARY_LEDGER_DECLARED_VERSION matches
// the frozen `_v6` key era by human declaration (the EKPO precedent:
// the baseline is declared from the key era, never parsed from it).
export const PRIMARY_LEDGER_DECLARED_VERSION = 6;
export const ATTEMPT_LOG_DECLARED_VERSION = 1;
export const PRACTICE_SESSION_CURRENT_VERSION = 1;
// Export-only formats (no stored dataset, no import path): the
// recovery packet copies raw storage bytes verbatim under `version`,
// the attempt-log export stamps its envelope the same way. The UI
// writers use the literals with a keep-in-step note, exactly like the
// fsrsRatingForQuality mirror, because both writers are synchronous
// and run before this module is imported.
export const RECOVERY_PACKET_VERSION = 1;
export const ATTEMPT_LOG_EXPORT_VERSION = 1;

// The registered migration chain. Empty: no dataset has ever had a
// second stored generation. Entries, when a real shape change lands,
// are { from, to, apply, note } with to === from + 1, a pure apply,
// and a non-empty note; validateStorageRegistry enforces the shape.
export const STORAGE_MIGRATIONS = Object.freeze([]);

export const STORAGE_REGISTRY = Object.freeze([
  Object.freeze({ id: "wrong", key: "a_w_v6", declaredVersion: PRIMARY_LEDGER_DECLARED_VERSION, versionField: null, note: "错题本：裸数组，无数据内版本字段；形状由 isWrongStorageList 探测，字段只增不改（FSRS 调度字段均为可选）" }),
  Object.freeze({ id: "record", key: "a_r_v6", declaredVersion: PRIMARY_LEDGER_DECLARED_VERSION, versionField: null, note: "练习记录：裸数组，isPracticeRecordStorage 探测；sessionId 可选" }),
  Object.freeze({ id: "days", key: "a_d_v6", declaredVersion: PRIMARY_LEDGER_DECLARED_VERSION, versionField: null, note: "学习日：字符串数组，isStudyDayStorage 探测" }),
  Object.freeze({ id: "qstats", key: "a_q_v6", declaredVersion: PRIMARY_LEDGER_DECLARED_VERSION, versionField: null, note: "逐题统计：裸对象（题 id → {t,c,last}），isQuestionStatsStorage 探测" }),
  Object.freeze({ id: "ai", key: "a_ai_v6", declaredVersion: PRIMARY_LEDGER_DECLARED_VERSION, versionField: null, note: "AI 对话：裸数组，isAIConversationStorage 探测" }),
  Object.freeze({ id: "prefs", key: "a_prefs_v6", declaredVersion: PRIMARY_LEDGER_DECLARED_VERSION, versionField: null, note: "偏好：裸对象，isPreferenceStorage 以键白名单探测" }),
  Object.freeze({ id: "graduated", key: "a_g_v6", declaredVersion: PRIMARY_LEDGER_DECLARED_VERSION, versionField: null, note: "毕业抽检：裸数组，isGraduatedStorageList 探测" }),
  Object.freeze({ id: "attempts", key: "a_attempts_v1", declaredVersion: ATTEMPT_LOG_DECLARED_VERSION, versionField: null, note: "作答流水：裸数组，isAttemptLogStorage 探测；无 FSRS 三件套的旧条目是登记在案的 legacy 条目形状，与当前条目并存读取，不迁移、不改写" }),
  Object.freeze({ id: "practice", key: "a_active_practice_v1", declaredVersion: PRACTICE_SESSION_CURRENT_VERSION, versionField: "version", note: "练习会话：唯一带数据内版本字段的数据集，版本判定走 classifyPracticeSessionVersion；高版本明确拒绝（与损坏区分），缺失/非整数印记按无效形状拒绝，与登记前行为一致" }),
  Object.freeze({ id: "error-events", key: "penny-error-events-v1", declaredVersion: ERROR_EVENT_LOG_SCHEMA_VERSION, versionField: null, note: "错误事件账：裸数组，条目由 isErrorEvent 校验；版本只出现在导出信封的 schemaVersion" }),
  Object.freeze({ id: "fsrs-shadow", key: "a_fsrs_shadow_v1", declaredVersion: FSRS_SHADOW_DECLARED_VERSION, versionField: null, note: "FSRS 影子日志：裸数组，条目由 isFsrsShadowRecord 校验；只算不改——现行调度从不读它，影子写入失败静默跳过、不锁定主流程；内容可由作答流水的 FSRS 字段重放再生，故不进恢复包" })
]);

// Registry self-check (spec §3.6): unique ids and keys, declared
// versions are safe integers, every entry carries a note, the one
// versioned dataset agrees with its classifier constant, and any
// future migration chain is gap-free with pure-step shape. Throws
// TypeError on the first defect; returns true when the registry is
// sound. Runs in the domain test suite, hence in the verify gate.
export function validateStorageRegistry(registry = STORAGE_REGISTRY, migrations = STORAGE_MIGRATIONS) {
  if (!Array.isArray(registry) || registry.length === 0) {
    throw new TypeError("storage registry must be a non-empty array");
  }
  const ids = new Set();
  const keys = new Set();
  for (const entry of registry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError("storage registry entry must be an object");
    }
    if (typeof entry.id !== "string" || !entry.id || ids.has(entry.id)) {
      throw new TypeError("storage registry entry id must be a unique non-empty string");
    }
    if (typeof entry.key !== "string" || !entry.key || keys.has(entry.key)) {
      throw new TypeError("storage registry entry key must be a unique non-empty string");
    }
    if (!Number.isSafeInteger(entry.declaredVersion) || entry.declaredVersion < 1) {
      throw new TypeError("storage registry entry declaredVersion must be a positive safe integer: " + entry.id);
    }
    if (!(entry.versionField === null || (typeof entry.versionField === "string" && entry.versionField.length > 0))) {
      throw new TypeError("storage registry entry versionField must be null or a non-empty string: " + entry.id);
    }
    if (typeof entry.note !== "string" || !entry.note.trim()) {
      throw new TypeError("storage registry entry note must be non-empty: " + entry.id);
    }
    ids.add(entry.id);
    keys.add(entry.key);
  }
  const practice = registry.find(entry => entry.id === "practice");
  if (!practice || practice.versionField !== "version" ||
      practice.declaredVersion !== PRACTICE_SESSION_CURRENT_VERSION) {
    throw new TypeError("the practice session entry must declare the classifier's current version");
  }
  if (!Array.isArray(migrations)) throw new TypeError("storage migrations must be an array");
  for (let i = 0; i < migrations.length; i++) {
    const step = migrations[i];
    if (!step || !Number.isSafeInteger(step.from) || step.to !== step.from + 1 ||
        typeof step.apply !== "function" || typeof step.note !== "string" || !step.note.trim()) {
      throw new TypeError("migration step must be { from, to: from + 1, apply, note }");
    }
    if (i > 0 && step.from !== migrations[i - 1].to) {
      throw new TypeError("migration chain must be gap-free");
    }
  }
  return true;
}

// The single version judgement for the one dataset that stamps a
// version inside its data. Pure; never mutates the input. Returns the
// spec's trace pair on every branch:
// - "current":          stamp === PRACTICE_SESSION_CURRENT_VERSION.
// - "unsupported-high": an integer stamp above current — data from a
//   newer build. Callers reject explicitly (never guess-read); this
//   status is what separates that case from corruption.
// - "invalid":          not a record, a missing/non-integer stamp, or
//   an integer below current (no such generation exists; the chain
//   is empty). The shape probe rejects these exactly as it always has.
export function classifyPracticeSessionVersion(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { status: "invalid", loadedVersion: null, migratedFrom: null };
  }
  const version = value.version;
  if (!Number.isSafeInteger(version)) {
    return { status: "invalid", loadedVersion: null, migratedFrom: null };
  }
  if (version === PRACTICE_SESSION_CURRENT_VERSION) {
    return { status: "current", loadedVersion: version, migratedFrom: null };
  }
  if (version > PRACTICE_SESSION_CURRENT_VERSION) {
    return { status: "unsupported-high", loadedVersion: version, migratedFrom: null };
  }
  return { status: "invalid", loadedVersion: version, migratedFrom: null };
}
