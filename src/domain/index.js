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
