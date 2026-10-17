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
        if (!Array.isArray(submittedAnswer) || !Array.isArray(expected) || submittedAnswer.length !== expected.length) return false;
        const actual = submittedAnswer.slice().sort((a, b) => a - b);
        const target = expected.slice().sort((a, b) => a - b);
        return actual.every((value, index) => value === target[index]);
      }
      case 'fill': {
        if (typeof normalize !== 'function') return false;
        const actual = normalize(submittedAnswer);
        return !!actual && Array.isArray(expected) && expected.some(value => normalize(value) === actual);
      }
      case 'order':
        return Array.isArray(submittedAnswer) && Array.isArray(expected) &&
          submittedAnswer.length === expected.length &&
          expected.every((value, index) => submittedAnswer[index] === value);
      default:
        return false;
    }
  }
  root.PennyQuestionGrading = Object.freeze({ isCorrect });
})(globalThis);
