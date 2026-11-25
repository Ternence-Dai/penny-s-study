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
