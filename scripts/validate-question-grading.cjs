'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('assets/js/question-grading.js', 'utf8');
const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const grade = context.PennyQuestionGrading.isCorrect;
const norm = value => String(value == null ? '' : value).trim().toLowerCase().replace(/[\s，,。.、；;：:！!？?"'（）()]/g, '').replace(/[°º]/g, '度').replace(/[′']/g, '分').replace(/[″"]/g, '秒');
const q = (type, answer) => ({ type, answer });
assert.equal(grade(q('single', 2), 2, norm), true);
assert.equal(grade(q('judge', 0), 1, norm), false);
assert.equal(grade(q('image', 1), 1, norm), true);
assert.equal(grade(q('multi', [1, 3]), [3, 1], norm), true);
assert.equal(grade(q('multi', [1, 3]), [1], norm), false);
assert.equal(grade(q('fill', ['银河系', '银河']), ' 银河系 ', norm), true);
assert.equal(grade(q('fill', ['银河系']), '', norm), false);
assert.equal(grade(q('order', [2, 0, 1]), [2, 0, 1], norm), true);
assert.equal(grade(q('order', [2, 0, 1]), [0, 2, 1], norm), false);
assert.equal(grade(q('unknown', 'x'), 'x', norm), false);

const examSubmitStart = app.indexOf('function submitExam(){');
const examSubmitEnd = app.indexOf('\n}', examSubmitStart);
assert.ok(examSubmitStart >= 0 && examSubmitEnd > examSubmitStart, 'exam submission function must be available');
const examSubmit = app.slice(examSubmitStart, examSubmitEnd);
assert.match(examSubmit, /if\s*\(done\)\s*Store\.bumpQStat\(q\.id,\s*ok\)/,
  'blank exam questions must not inflate attempted-question mastery statistics');
assert.doesNotMatch(examSubmit, /Store\.bumpQStat\(q\.id,\s*ok\s*&&\s*done\)/,
  'exam mastery statistics must not count unanswered questions as wrong attempts');

console.log('Question grading and blank-exam-statistics checks passed.');
