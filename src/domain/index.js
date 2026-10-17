export function gradeAnswer({ expectedAnswer, submittedAnswer, evidenceStatus }) {
  if (typeof expectedAnswer !== "string" || !expectedAnswer.trim()) throw new TypeError("expectedAnswer is required");
  if (typeof submittedAnswer !== "string") throw new TypeError("submittedAnswer must be a string");
  if (!["verified","review-needed","draft"].includes(evidenceStatus)) throw new RangeError("invalid evidence status");
  const correct = submittedAnswer.trim().toLocaleLowerCase() === expectedAnswer.trim().toLocaleLowerCase();
  return Object.freeze({ correct, score:correct ? 1 : 0, evidenceStatus, feedback: evidenceStatus === "verified" ? (correct ? "回答正确" : "再检查关键概念") : "本题答案尚未完成来源审核，评分仅供练习参考" });
}
export function nextReviewDate({ reviewedAt, quality, previousIntervalDays = 0 }) {
  if (!Number.isFinite(Date.parse(reviewedAt))) throw new TypeError("reviewedAt must be a valid date");
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) throw new RangeError("quality must be an integer from 0 to 5");
  if (!Number.isInteger(previousIntervalDays) || previousIntervalDays < 0) throw new RangeError("previousIntervalDays must be non-negative");
  const interval = quality < 3 ? 1 : previousIntervalDays === 0 ? 1 : Math.max(1, Math.round(previousIntervalDays * (quality >= 4 ? 2.5 : 1.5)));
  const due = new Date(Date.parse(reviewedAt) + interval * 86400000);
  return Object.freeze({ intervalDays:interval, dueAt:due.toISOString() });
}
