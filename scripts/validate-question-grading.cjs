'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('assets/js/question-grading.js', 'utf8');
const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const questionSource = fs.readFileSync('assets/js/question-bank.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const productCss = fs.readFileSync('assets/css/product-system.css', 'utf8');
assert.ok(html.includes('product-system.css?v=20261018-v3'),
  'astronomy app must load the current V3 learning workspace styles');
assert.ok(productCss.includes('Astronomy learning workspace'),
  'astronomy V3 design layer must be present');
for (const selector of [
  '.study-intro{', '.quick-grid{', '.quick-card{', '.map-grid{',
  '.map-card{', '.progress-overview{', '.option{', '.explain{',
  '.tabbar{', '.reader-panel{'
]) assert.ok(productCss.includes(selector),
  'astronomy workspace must style the learning/answering surface: ' + selector);
assert.ok(productCss.includes('max-width:1160px') &&
          productCss.includes('@media(max-width:760px)') &&
          productCss.includes('@media(max-width:420px)'),
  'astronomy workspace must support wide desktop and narrow mobile screens');
assert.ok(productCss.includes('prefers-reduced-motion:reduce'),
  'astronomy workspace must respect reduced motion preferences');
assert.ok(html.includes('viewport-fit=cover') && !html.includes('user-scalable=no'),
  'mobile page must respect safe areas and not disable pinch zoom');

const context = vm.createContext({});
vm.runInContext(source, context);
const grade = context.PennyQuestionGrading.isCorrect;
const norm = value => String(value == null ? '' : value).trim().toLowerCase().replace(/([0-9])\s*[′']/g, '$1分').replace(/([0-9])\s*[″"]/g, '$1秒').replace(/[°º]/g, '度').replace(/[\s，,。.、；;：:！!？?'"′″（）()]/g, '');
const q = (type, answer) => ({ type, answer });
assert.equal(norm("20°30'"), norm("20°30′"), 'ASCII apostrophe must normalize as angle minutes');
assert.equal(norm('20°30"'), norm('20°30″'), 'ASCII quote must normalize as angle seconds');
assert.equal(grade(q('fill', ['20°30′']), "20°30'", norm), true);
assert.equal(grade(q('fill', ['20°30″']), '20°30"', norm), true);
assert.equal(grade(q('fill', ['20°30′']), "20°30 '", norm), true,
  'whitespace before ASCII minute marker must be ignored');
assert.equal(grade(q('fill', ['20°30″']), '20°30 "', norm), true,
  'whitespace before ASCII second marker must be ignored');
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
assert.equal(grade(q('fill', ['42']), '42', () => { throw new Error('normalizer failed'); }), false);
assert.equal(grade(q('fill', ['42']), '42', value => {
  if (value === '42') throw new Error('expected-answer normalization failed');
  return value;
}), false);
assert.equal(grade(q('order', [2, 0, 1]), [2, 0, 1], norm), true);
assert.equal(grade(q('order', [2, 0, 1]), [0, 2, 1], norm), false);
assert.equal(grade(q('order', []), [], norm), false);
assert.equal(grade(q('unknown', 'x'), 'x', norm), false);

const examSubmitStart = app.indexOf('async function submitExam(){');
const examSubmitEnd = app.indexOf('\n}', examSubmitStart);
assert.ok(examSubmitStart >= 0 && examSubmitEnd > examSubmitStart, 'exam submission function must be available');
const examSubmit = app.slice(examSubmitStart, examSubmitEnd);

const reviewStart = app.indexOf('var reviewSchedulerPromise = null;');
const reviewEnd = app.indexOf('/* ==========================================' + String.fromCharCode(10) + '   竞赛', reviewStart);
assert.ok(reviewStart >= 0 && reviewEnd > reviewStart,
  'shared spaced-review scheduler must be wired into the learning application');
const reviewSource = app.slice(reviewStart, reviewEnd);
assert.ok(reviewSource.includes("import('../../src/domain/index.js')") &&
          reviewSource.includes('domain.nextReviewDate(') &&
          reviewSource.includes('Store.scheduleWrongReview('),
  'practice/exam outcomes must call the shared domain scheduler and persist the due date');
assert.ok(reviewSource.includes('streak>=3') && reviewSource.includes('Store.removeWrong(id)'),
  'three consecutive correct reviews must retire an item from the active wrong book');
assert.ok(app.includes('async function pSubmit()') &&
          app.includes('await recordQuestionOutcome(q.id,ok)') &&
          examSubmit.includes('await recordQuestionOutcome(q.id,ok)'),
  'both practice and timed exams must update the same review schedule');
assert.ok(app.includes('已到期') && app.includes('nextReviewAt<=now') &&
          app.includes('优先安排已到期的错题'),
  'wrong-book UI must expose due dates and prioritize overdue reviews');
assert.ok(app.includes('if(item.nextReviewAt!==undefined') &&
          app.includes('correctStreak') && app.includes('lastOutcome'),
  'wrong-book storage validation must accept legacy rows and validate optional review metadata');

assert.ok(examSubmit.includes('if(!done)blank++') &&
          examSubmit.includes('Store.bumpQStat(q.id,ok)'),
  'blank exam questions must not inflate attempted-question mastery statistics');
assert.match(examSubmit, /else\\s*\\{[\\s\\S]*?Store\\.bumpQStat\\(q\\.id,ok\\)/,
  'only answered exam questions may update mastery and spaced-review records');

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
