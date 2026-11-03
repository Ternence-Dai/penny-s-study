'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const runtime = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const start = runtime.indexOf('function isValidQuestionEvidenceReviewTimestamp(value){');
const end = runtime.indexOf('\nfunction isValidQuestionEvidenceRecord', start);
assert.ok(start >= 0 && end > start, 'question evidence timestamp validator must exist');
const validatorSource = runtime.slice(start, end);
const validate = vm.runInNewContext(validatorSource + '\nisValidQuestionEvidenceReviewTimestamp;');
assert.equal(typeof validate, 'function');

for (const timestamp of [
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00.123Z',
  '2026-01-01T00:00:00+14:00',
  '2026-01-01T00:00:00-12:00'
]) {
  assert.equal(validate(timestamp), true, 'valid RFC3339-style timestamp should pass: ' + timestamp);
}
for (const timestamp of [
  '2026-01-01T00:00:00+14:01',
  '2026-01-01T00:00:00+15:00',
  '2026-01-01T00:00:00+23:59',
  '2026-01-01T00:00:00+00:60',
  '2026-01-01T00:00:00-00:00',
  '2026-02-29T00:00:00Z',
  '2026-01-01T00:00:00'
]) {
  assert.equal(validate(timestamp), false, 'invalid timestamp must fail closed: ' + timestamp);
}
console.log('Question-evidence timestamp offset validation checks passed.');
