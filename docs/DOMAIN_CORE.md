# Astronomy question grading contract

`assets/js/question-grading.js` exposes a pure `PennyQuestionGrading.isCorrect(question, submittedAnswer, normalize)` function for the six supported question types.

## Type rules

| Type | Answer contract |
|---|---|
| `single` | Strict value equality with the stored answer index/value |
| `judge` | Strict value equality with the stored truth/false index |
| `image` | Strict value equality with the stored image-option answer |
| `multi` | Order-independent multiset equality: every expected choice must occur exactly once, with no extras, duplicates, or type coercion |
| `fill` | Text answer compared after the supplied normalizer; at least one non-empty expected normalized string must match |
| `order` | Exact sequence equality; order and length both matter |

Unknown types, missing answers, malformed expected values, empty multi/fill/order answer sets, and invalid normalizer results are graded incorrect rather than guessed.

## Important distinctions

- Multi-select answers are compared as multisets, not sets: duplicated choices do not pass.
- Numeric, string and boolean option values remain type-distinct. For example, numeric `1` is not silently treated as string `"1"`.
- Fill-in normalization is owned by the caller so punctuation, whitespace, and astronomy-specific notation rules stay explicit and testable.
- Ordering questions require the submitted array to match the expected sequence exactly.

## Attempt statistics

The application must determine whether a question was answered separately from whether it was correct. Blank questions are not attempted questions and must not increase mastery attempt/wrong counts. They may still appear in the exam result as blank.

## Verification boundary

`scripts/validate-question-grading.cjs` exercises the six grading rules, malformed inputs, normalizer failures, duplicate multi-select values, and blank-exam statistics. The question-bank validator checks content structure and selected known astronomy corrections. A passing grading test does not by itself verify every astronomy fact in the bank.
