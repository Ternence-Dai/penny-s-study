/* Pure grading rules for the six supported astronomy question types. */
(function (root) {
  'use strict';
  function isCorrect(question, submittedAnswer, normalize) {
    if (!question || submittedAnswer === undefined || submittedAnswer === null) return false;
    const expected = question.answer;
    switch (question.type) {
      case 'single':
      case 'judge':
      case 'image':
        return submittedAnswer === expected;
      case 'multi': {
        if (!Array.isArray(submittedAnswer) || !Array.isArray(expected) ||
            expected.length === 0 || submittedAnswer.length !== expected.length) return false;
        const keyOf = value => {
          if (typeof value === 'string') return `string:${value}`;
          if (typeof value === 'boolean') return `boolean:${value}`;
          if (typeof value === 'number' && Number.isFinite(value)) return `number:${value}`;
          return null;
        };
        const counts = new Map();
        for (const value of expected) {
          const key = keyOf(value);
          if (key === null) return false;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        for (const value of submittedAnswer) {
          const key = keyOf(value);
          if (key === null || !counts.has(key)) return false;
          const remaining = counts.get(key) - 1;
          if (remaining < 0) return false;
          if (remaining === 0) counts.delete(key);
          else counts.set(key, remaining);
        }
        return counts.size === 0;
      }
      case 'fill': {
        if (typeof normalize !== 'function' || !Array.isArray(expected) || expected.length === 0) return false;
        const actual = normalize(submittedAnswer);
        return !!actual && expected.some(value => normalize(value) === actual);
      }
      case 'order':
        return Array.isArray(submittedAnswer) && Array.isArray(expected) &&
          expected.length > 0 && submittedAnswer.length === expected.length &&
          expected.every((value, index) => submittedAnswer[index] === value);
      default:
        return false;
    }
  }
  root.PennyQuestionGrading = Object.freeze({ isCorrect });
})(globalThis);
