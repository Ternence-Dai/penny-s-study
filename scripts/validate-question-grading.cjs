'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('assets/js/question-grading.js', 'utf8');
const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const questionSource = fs.readFileSync('assets/js/question-bank.js', 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const grade = context.PennyQuestionGrading.isCorrect;
const norm = value => String(value == null ? '' : value).trim().toLowerCase().replace(/[\\s，,。.、；;：:！!？?\"'（）()]/g, '').replace(/[°º]/g, '度').replace(/[′']/g, '分').replace(/[″\"]/g, '秒');
const q = (type, answer) => ({ type, answer });
assert.equal(grade(q('single', 2), 2, norm), true);
assert.equal(grade(q('judge', 0), 1, norm), false);
assert.equal(grade(q('image', 1), 1, norm), true);
assert.equal(grade(q('multi', [1, 3]), [3, 1], norm), true);
assert.equal(grade(q('multi', [1, 3]), [1], norm), false);
assert.equal(grade(q('multi', ['choice-10', 'choice-2']), ['choice-2', 'choice-10'], norm), true);
assert.equal(grade(q('multi', ['choice-1', 'choice-2']), ['choice-1', 'choice-1'], norm), false);
assert.equal(grade(q('multi', [1, 2]), ['1', 2], norm), false);
assert.equal(grade(q('multi', [{ id: 1 }]), [{ id: 1 }], norm), false);
assert.equal(grade(q('multi', []), [], norm), false);
assert.equal(grade(q('fill', ['银河系', '银河']), ' 银河系 ', norm), true);
assert.equal(grade(q('fill', ['银河系']), '', norm), false);
assert.equal(grade(q('fill', []), 'anything', norm), false);
assert.equal(grade(q('fill', [{}]), '[object Object]', norm), false);
assert.equal(grade(q('fill', ['42']), 42, norm), false);
assert.equal(grade(q('fill', ['42']), '42', () => 42), false);
assert.equal(grade(q('order', [2, 0, 1]), [2, 0, 1], norm), true);
assert.equal(grade(q('order', [2, 0, 1]), [0, 2, 1], norm), false);
assert.equal(grade(q('order', []), [], norm), false);
assert.equal(grade(q('unknown', 'x'), 'x', norm), false);

const examSubmitStart = app.indexOf('function submitExam(){');
const examSubmitEnd = app.indexOf('\n}', examSubmitStart);
assert.ok(examSubmitStart >= 0 && examSubmitEnd > examSubmitStart, 'exam submission function must be available');
const examSubmit = app.slice(examSubmitStart, examSubmitEnd);
assert.match(examSubmit, /if\s*\(done\)\s*Store\.bumpQStat\(q\.id,\s*ok\)/,
  'blank exam questions must not inflate attempted-question mastery statistics');
assert.doesNotMatch(examSubmit, /Store\.bumpQStat\(q\.id,\s*ok\s*&&\s*done\)/,
  'exam mastery statistics must not count unanswered questions as wrong attempts');

assert.ok(questionSource.includes("最早将望远镜系统用于天文观测并公开重要发现的科学家是？"),
  'Galileo question must distinguish systematic published astronomy from the first-ever telescope observation');
assert.ok(!questionSource.includes("首次用望远镜观测天体的科学家是？"),
  'question bank must not make the historically inaccurate absolute-first claim');
console.log('Question grading and blank-exam-statistics checks passed.');

assert.ok(questionSource.includes("从全球每年发生的天象次数看，日食通常比月食更常见。"),
  'eclipse frequency question must distinguish global event counts from visibility area');
assert.match(questionSource, /\['p089'.*?,0,'全球每年通常发生2至5次日食，而月食通常为0至3次/s,
  'p089 must mark the globally more frequent solar eclipses as true and explain visibility-area distinction');

assert.ok(questionSource.includes("当月球本影到达地球表面时，处于本影内的观测者看到的是？"),
  'total solar eclipse question must explicitly identify the umbra, not an ambiguous central shadow region');
assert.ok(questionSource.includes("若到达地表的是伪本影，则会看到日环食。"),
  'eclipse explanation must distinguish umbra from antumbra');

assert.ok(questionSource.includes("滤光镜必须牢固安装在物镜前端"),
  'solar viewing safety explanation must specify front-mounted telescope filters');
assert.ok(questionSource.includes("偏食阶段仍须使用合格太阳滤光镜"),
  'partial solar eclipse viewing must retain certified eye protection');

assert.ok(questionSource.includes("在北半球，北极星的地平高度约等于观测者所在的地理纬度。"),
  'Polaris altitude rule must be explicitly scoped to northern-hemisphere observers');
