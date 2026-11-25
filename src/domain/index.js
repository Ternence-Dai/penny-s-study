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
  Object.freeze({ id: "error-events", key: "penny-error-events-v1", declaredVersion: ERROR_EVENT_LOG_SCHEMA_VERSION, versionField: null, note: "错误事件账：裸数组，条目由 isErrorEvent 校验；版本只出现在导出信封的 schemaVersion" })
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
