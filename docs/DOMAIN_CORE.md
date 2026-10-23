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

## Attempt statistics and spaced review

The application must determine whether a question was answered separately from whether it was correct. Blank questions are not attempted questions and must not increase mastery attempt/wrong counts. They may still appear in the exam result as blank.

The wrong-question ledger stores optional, validated review metadata: interval days, next-review timestamp, last review outcome and consecutive-correct streak. Legacy rows without these fields remain valid and are treated as due for review. Wrong answers reset the interval to one day; a correct review increases the interval using `nextReviewDate`; three consecutive correct reviews remove the item from the active wrong book while question mastery statistics remain available. Practice sessions and timed exams use the same review scheduler.

## Verification boundary

`scripts/validate-question-grading.cjs` exercises the six grading rules, malformed inputs, normalizer failures, duplicate multi-select values, and blank-exam statistics. The question-bank validator checks content structure and selected known astronomy corrections. A passing grading test does not by itself verify every astronomy fact in the bank.

## Open-source astronomy and learning references

- [Stellarium](https://github.com/Stellarium/stellarium) is a reference for astronomical object presentation, sky orientation, time/location-aware simulation, and keeping visualizations tied to astronomical coordinates and ephemerides. The current in-browser simulator is not a replacement for a precision planetarium engine.
- [Astropy](https://github.com/astropy/astropy) is a reference for unit-aware astronomical calculations, coordinate systems, time handling, and scientific-data conventions. Any future port of calculations must preserve units and documented precision.
- Question-bank structure is validated independently from scientific correctness. Each answer key and explanation still requires an attributable source, review date, and reviewer before it can be labelled verified; passing structural tests does not certify factual accuracy.


## Question-bank option integrity

The 300-question validation also rejects blank or non-text choice options, options that become duplicates after trimming, and repeated fill-in accepted-answer entries. This catches malformed imported bank content before it reaches the grading UI.

 
## Version-bound question review evidence

The question evidence manifest supports three distinct states: `review-needed`, `verified`, and `rejected`. A source link alone never changes a question's review state.

A question may be marked `verified` or `rejected` only when the record includes:
- a reviewer attribution and timezone-qualified review timestamp;
- explicit review attestations for the question stem, answer key, and explanation;
- a SHA-256 digest of the exact current question-bank row, binding the decision to the reviewed wording, options, answer and explanation;
- at least one source on the approved NASA/IAU/Chinese official-source host allowlist; and
- a non-empty rejection reason when the outcome is `rejected`.

If the question-bank row changes after review, its digest no longer matches and the validator rejects the stale review record. The current 300 questions remain `review-needed`; this change does not promote any AI-collected candidate source or question to verified.

This is a data-integrity gate, not an authentication system: reviewer names are attribution fields, not proof of identity. Publishing a review decision still requires a trusted human review and a controlled repository change. The static site does not provide secure multi-user review submission or role-based authorization.
