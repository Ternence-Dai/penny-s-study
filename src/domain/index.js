export function gradeAnswer({ expectedAnswer, submittedAnswer, evidenceStatus }) {
  if (typeof expectedAnswer !== "string" || !expectedAnswer.trim()) throw new TypeError("expectedAnswer is required");
  if (typeof submittedAnswer !== "string") throw new TypeError("submittedAnswer must be a string");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(expectedAnswer) ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(submittedAnswer)) {
    throw new TypeError("answers must not contain non-whitespace control characters");
  }
  if (expectedAnswer.length > 10000 || submittedAnswer.length > 10000) {
    throw new RangeError("answers must not exceed 10000 characters");
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
    if (minute > 59 || hour > 14 || (hour === 14 && minute !== 0)) {
      throw new TypeError("reviewedAt contains an invalid timezone offset");
    }
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError("reviewedAt must be a valid timestamp");
  const yearUTC = new Date(timestamp).getUTCFullYear();
  if (yearUTC < 0 || yearUTC > 9999) throw new RangeError("reviewedAt normalizes outside the supported UTC year range");
  return timestamp;
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
