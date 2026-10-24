'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('assets/js/question-grading.js', 'utf8');
const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const questionSource = fs.readFileSync('assets/js/question-bank.js', 'utf8');
const questionContext = vm.createContext({});
vm.runInContext(questionSource, questionContext);
const questionBank = questionContext.Q;
assert.ok(Array.isArray(questionBank) && questionBank.length === 300,
  'question bank must contain the documented 300 question records');
const starsAnchor = app.indexOf("var c = document.getElementById('starsBg')");
const skyStart = app.lastIndexOf('(function(){', starsAnchor);
const skyEnd = app.indexOf('\n})();', skyStart);
assert.ok(starsAnchor >= 0 && skyStart >= 0 && skyEnd > skyStart,
  'astronomy starfield renderer must be present');
const skySource = app.slice(skyStart, skyEnd + '\n})();'.length);
function runSky({ reducedMotion = false, hidden = false } = {}) {
  let frames = 0;
  let visibilityHandler = null;
  const canvas = {width:0,height:0,style:{},getContext:()=>({
    setTransform(){},clearRect(){},beginPath(){},arc(){},fill(){}
  })};
  const context = {
    window: {
      devicePixelRatio:1,innerWidth:800,innerHeight:600,
      matchMedia:()=>({matches:reducedMotion}),
      addEventListener(){}
    },
    document: {
      hidden,
      getElementById:()=>canvas,
      addEventListener:(name,handler)=>{if(name==='visibilitychange')visibilityHandler=handler;}
    },
    requestAnimationFrame:()=>{frames++;},
    Math
  };
  vm.runInNewContext(skySource, context);
  const initialFrames=frames;
  if(hidden && visibilityHandler){
    context.document.hidden=false;
    visibilityHandler();
  }
  return {initialFrames,frames};
}
assert.equal(runSky({reducedMotion:true}).frames,0,
  'reduced-motion preference must render a static starfield without scheduling animation frames');
const backgroundSky=runSky({hidden:true});
assert.equal(backgroundSky.initialFrames,0,
  'background tabs must not schedule continuous starfield animation');
assert.equal(backgroundSky.frames,1,
  'starfield animation must resume once a hidden tab becomes visible');
assert.equal(runSky({reducedMotion:false,hidden:false}).frames,1,
  'visible users who allow motion must keep the animated starfield running');
assert.ok(app.includes("document.addEventListener('visibilitychange', redrawWhenVisible)") &&
          app.includes("window.matchMedia('(prefers-reduced-motion: reduce)')"),
  'starfield must resume on tab visibility and respect the operating-system motion preference');

const questionIds = new Set();
for (const question of questionBank) {
  assert.ok(question && typeof question === 'object', 'each question must be an object');
  assert.ok(typeof question.id === 'string' && question.id.trim(),
    'each question must have a non-empty stable ID');
  assert.ok(!questionIds.has(question.id), 'question IDs must be unique: ' + question.id);
  questionIds.add(question.id);
  assert.ok(['小学','初中','高中'].includes(question.level),
    'question must declare a supported learner level: ' + question.id);
  assert.ok(typeof question.category === 'string' && question.category.trim(),
    'question must declare a topic category: ' + question.id);
  assert.ok(typeof question.stem === 'string' && question.stem.trim(),
    'question must have a non-empty stem: ' + question.id);
  assert.ok(typeof question.explanation === 'string' && question.explanation.trim(),
    'question must have a worked explanation: ' + question.id);
  assert.ok(['single','judge','image','multi','fill','order'].includes(question.type),
    'question type must be one of the six supported formats: ' + question.id);
  if (Array.isArray(question.options)) {
    assert.ok(question.options.every(option => typeof option === 'string' && option.trim()),
      'every choice option must be non-empty text: ' + question.id);
    const normalizedOptions = question.options.map(option => option.trim());
    assert.equal(new Set(normalizedOptions).size, normalizedOptions.length,
      'choice options must be unique after trimming: ' + question.id);
  }
  if (question.type === 'judge') {
    assert.equal(question.options, null,
      'true/false questions use the dedicated binary grading contract: ' + question.id);
    assert.ok(question.answer === 0 || question.answer === 1,
      'true/false answer must use the documented binary key: ' + question.id);
  } else if (['single','image'].includes(question.type)) {
    assert.ok(Array.isArray(question.options) && question.options.length >= 2,
      'choice question must have at least two options: ' + question.id);
    assert.ok(Number.isSafeInteger(question.answer) &&
      question.answer >= 0 && question.answer < question.options.length,
      'choice answer index must point to an existing option: ' + question.id);
  } else if (question.type === 'multi') {
    assert.ok(Array.isArray(question.options) && question.options.length >= 2 &&
      Array.isArray(question.answer) && question.answer.length > 0,
      'multi-select question must have options and at least one correct answer: ' + question.id);
    assert.ok(question.answer.every(index => Number.isSafeInteger(index) &&
      index >= 0 && index < question.options.length),
      'multi-select answer indexes must point to existing options: ' + question.id);
    assert.equal(new Set(question.answer).size, question.answer.length,
      'multi-select answer indexes must not contain duplicates: ' + question.id);
  } else if (question.type === 'fill') {
    assert.ok(question.options === null &&
      Array.isArray(question.answer) && question.answer.length > 0 &&
      question.answer.every(value => typeof value === 'string' && value.trim()),
      'fill-in question must have one or more textual accepted answers: ' + question.id);
    const acceptedAnswers = question.answer.map(value => value.trim());
    assert.equal(new Set(acceptedAnswers).size, acceptedAnswers.length,
      'fill-in accepted answers must not contain duplicate entries: ' + question.id);
  } else if (question.type === 'order') {
    assert.ok(Array.isArray(question.options) && question.options.length >= 2 &&
      Array.isArray(question.answer) && question.answer.length === question.options.length,
      'ordering question must provide one answer index per option: ' + question.id);
    assert.deepEqual(Array.from(question.answer).sort((a,b)=>a-b),
      Array.from({length:question.options.length},(_,index)=>index),
      'ordering answer must be a permutation of all option indexes: ' + question.id);
  }
}

const html = fs.readFileSync('index.html', 'utf8');
const productCss = fs.readFileSync('assets/css/product-system.css', 'utf8');
assert.ok(html.includes('product-system.css?v=20261019-v8'),
  'astronomy app must load the current V8 learning workspace styles');
assert.ok(html.includes('practice-session-v9.css?v=20261019-v9') &&
          /legacy-app\.js\?v=\d{8}-[^"' ]+/.test(html),
  'astronomy app must load the recoverable practice UI and a cache-busted session runtime');
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

assert.ok(productCss.includes('V4 · XingSaiTong astronomy learning cockpit') &&
          productCss.includes('.study-intro:after{') &&
          productCss.includes('.product-workflow__grid{') &&
          productCss.includes('.view .option:hover{'),
  'astronomy V4 must implement the orbit-themed learning hero, learning workflow and answer interaction states');
assert.ok(productCss.includes('@media(max-width:760px)') &&
          productCss.includes('@media(max-width:420px)') &&
          productCss.includes('.product-workflow__item:hover'),
  'astronomy V4 must include responsive learning workflow layouts and interactive states');

assert.ok(productCss.includes('prefers-reduced-motion:reduce'),
  'astronomy workspace must respect reduced motion preferences');
assert.ok(html.includes('viewport-fit=cover') && !html.includes('user-scalable=no'),
  'mobile page must respect safe areas and not disable pinch zoom');

const context = vm.createContext({});
vm.runInContext(source, context);
const grade = context.PennyQuestionGrading.isCorrect;
const norm = value => String(value == null ? '' : value).normalize('NFC').trim().toLowerCase().replace(/([0-9])\s*[′']/g, '$1分').replace(/([0-9])\s*[″"]/g, '$1秒').replace(/[°º]/g, '度').replace(/[\s，,。.、；;：:！!？?'"′″（）()]/g, '');
const q = (type, answer) => ({ type, answer });
assert.equal(norm('3.26'), '3.26',
  'decimal points between digits are significant scientific notation and must be preserved');
assert.notEqual(norm('3.26'), norm('326'),
  'a decimal answer must not collapse into an integer answer');
assert.equal(norm('365.2425'), '365.2425');
assert.notEqual(norm('365.2425'), norm('3652425'));
assert.equal(grade(q('fill', ['3.26']), '3.26', norm), true);
assert.equal(grade(q('fill', ['3.26']), '326', norm), false,
  'the live grader must reject an integer when the accepted answer is a decimal');
assert.equal(grade(q('fill', ['365.2425']), '3652425', norm), false);
assert.equal(grade(q('fill', ['3.26']), '3.26。', norm), true,
  'sentence punctuation may be removed without discarding the decimal point');
const parsecQuestion = questionBank.find(question => question.id === 'j149');
const tropicalYearQuestion = questionBank.find(question => question.id === 'j113');
assert.ok(parsecQuestion && tropicalYearQuestion, 'decimal astronomy reference questions must remain in the bank');
assert.equal(grade(parsecQuestion, '3.26', norm), true);
assert.equal(grade(parsecQuestion, '326', norm), false);
assert.equal(grade(tropicalYearQuestion, '365.2425', norm), true);
assert.equal(grade(tropicalYearQuestion, '3652425', norm), false);
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
assert.equal(grade(q('fill', ['Café']), 'Cafe'+String.fromCharCode(0x301), norm), true,
  'canonically equivalent Unicode answers must grade identically in the live normalizer');
assert.equal(grade(q('fill', ['银河系']), '', norm), false);
assert.equal(grade(q('fill', []), 'anything', norm), false);
assert.equal(grade(q('fill', [{}]), '[object Object]', norm), false);
assert.equal(grade(q('fill', ['42']), 42, norm), false);
assert.equal(grade(q('fill', ['42']), 'x'.repeat(4097), value => value), false,
  'free-text grading must reject oversized submitted answers before normalization');
assert.equal(grade(q('fill', ['x'.repeat(4097)]), 'x'.repeat(4097), value => value), false,
  'free-text grading must reject oversized accepted variants');
assert.equal(grade(q('fill', Array(129).fill('x')), 'x', value => value), false,
  'free-text grading must cap accepted answer variants');
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

const inputStart = app.indexOf('function renderInput(q, ua, show, fn){');
const inputEnd = app.indexOf('\nfunction onFill(', inputStart);
assert.ok(inputStart >= 0 && inputEnd > inputStart, 'shared answer renderer must be available');
const inputSource = app.slice(inputStart, inputEnd);
assert.ok(app.includes("if (q && q.type === 'judge') return ['正确','错误'];"),
  'judge questions must receive explicit binary display labels without changing the compact bank contract');
assert.ok(inputSource.includes('questionOptions(q).map('),
  'all option-based answer types must render through the normalized option list');
assert.ok(app.includes('n <= questionOptionCount(q)') && app.includes('n2 <= questionOptionCount(q2)'),
  'practice and timed exams must use the same safe keyboard option count for binary questions');

const examSubmitStart = app.indexOf('async function submitExam(){');
const examSubmitEnd = app.indexOf('\n}', examSubmitStart);
assert.ok(examSubmitStart >= 0 && examSubmitEnd > examSubmitStart, 'exam submission function must be available');
const examSubmit = app.slice(examSubmitStart, examSubmitEnd);

const reviewStart = app.indexOf('var reviewSchedulerPromise = null;');
const reviewEnd = app.indexOf('/* ==========================================' + String.fromCharCode(10) + '   竞赛', reviewStart);
assert.ok(reviewStart >= 0 && reviewEnd > reviewStart,
  'shared spaced-review scheduler must be wired into the learning application');
const reviewSource = app.slice(reviewStart, reviewEnd);
const reviewSchedulerImport = /import\(['"]\.\.\/\.\.\/src\/domain\/index\.js(?:\?v=[^'"]+)?['"]\)/;
assert.ok(reviewSchedulerImport.test(reviewSource) &&
          reviewSource.includes('domain.nextReviewDate(') &&
          reviewSource.includes('Store.scheduleWrongReview('),
  'practice/exam outcomes must call the shared, cache-versioned domain scheduler and persist the due date');
assert.ok(reviewSource.includes('streak>=3') && reviewSource.includes('Store.removeWrong(id)'),
  'three consecutive correct reviews must retire an item from the active wrong book');
assert.ok(app.includes('async function pSubmit()') &&
          app.includes('await recordQuestionOutcome(q.id,ok)') &&
          examSubmit.includes('await recordQuestionOutcome(q.id,ok)'),
  'both practice and timed exams must update the same review schedule');
assert.ok(app.includes("practice:'a_active_practice_v1'") &&
          app.includes('function isActivePracticeStorage(value)') &&
          app.includes('getActivePractice:function()') &&
          app.includes('saveActivePractice:function(p)') &&
          app.includes('clearActivePractice:function()'),
  'active practice progress must use a separate versioned, validated storage key');
assert.ok(app.includes('function resumePractice()') &&
          app.includes('function discardActivePractice()') &&
          app.includes('继续上次练习') &&
          app.includes('SESSION RECOVERY') &&
          app.includes('questionIds'),
  'home workspace must restore saved sessions by stable question ID without changing the question bank');
assert.ok(app.includes('Store.saveActivePractice(p);') &&
          app.includes("if(state.page==='practice'&&state.practice) Store.saveActivePractice(state.practice);") &&
          app.includes('Store.clearActivePractice();'),
  'practice answers, navigation and completion must safely maintain the active-session draft');

assert.ok(app.includes('已到期') && app.includes('nextReviewAt<=now') &&
          app.includes('优先安排已到期的错题'),
  'wrong-book UI must expose due dates and prioritize overdue reviews');
assert.ok(app.includes('if(item.nextReviewAt!==undefined') &&
          app.includes('correctStreak') && app.includes('lastOutcome'),
  'wrong-book storage validation must accept legacy rows and validate optional review metadata');

assert.ok(examSubmit.includes('if(!done)blank++') &&
          examSubmit.includes('Store.bumpQStat(q.id,ok)'),
  'blank exam questions must not inflate attempted-question mastery statistics');
assert.ok(examSubmit.includes('if(!done)blank++;') &&
          examSubmit.indexOf('if(!done)blank++;') < examSubmit.indexOf('Store.bumpQStat(q.id,ok)') &&
          examSubmit.includes('await recordQuestionOutcome(q.id,ok)'),
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


// Exercise the actual browser handlers, not only the pure grading function.
// The UI emits numeric option indexes in inline callbacks; these tests execute
// those callbacks against isolated practice/exam state and grade the result.
function extractFunction(source, name) {
  const marker = 'function ' + name + '(';
  const start = source.indexOf(marker);
  assert.ok(start >= 0, 'application handler must exist: ' + name);
  const open = source.indexOf('{', start);
  let depth = 0, quote = null, escaped = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unterminated function: ' + name);
}
assert.ok(app.includes('function buildRawLearningRecoveryPacket(storage, exportedAt)') &&
          app.includes('function exportRawLearningRecovery()') &&
          app.includes('if(storageRecoveryRequired)') &&
          app.includes('onclick="exportRawLearningRecovery()"'),
  'local-storage recovery lock must be visible and provide an executable raw-data export');
const recoveryBannerSource = extractFunction(app, 'renderStorageRecoveryBanner');
const mainRenderSource = extractFunction(app, 'render');
assert.ok(recoveryBannerSource.includes('导出原始存档恢复包') &&
          recoveryBannerSource.includes('role="alert"') &&
          mainRenderSource.indexOf('view.innerHTML = fn();') <
          mainRenderSource.indexOf('if(storageRecoveryRequired) view.insertAdjacentHTML'),
  'the recovery warning must appear on every page after page-specific storage reads can detect a damaged record');

const packetContext = vm.createContext({
  KEY: { wrong: 'a_w_v6', practice: 'a_active_practice_v1' },
  Date, Number, TypeError
});
vm.runInContext(extractFunction(app, 'buildRawLearningRecoveryPacket'), packetContext);
const rawStorage = new Map([['a_w_v6', '[broken record'], ['a_active_practice_v1', '{broken json']]);
const packet = packetContext.buildRawLearningRecoveryPacket(
  { getItem: key => rawStorage.has(key) ? rawStorage.get(key) : null },
  new Date('2026-10-20T00:00:00.000Z')
);
assert.equal(packet.format, 'penny-s-study-raw-local-storage-recovery');
assert.equal(packet.entries[0].raw, '[broken record');
assert.equal(packet.entries[1].raw, '{broken json',
  'recovery export must preserve unparseable local records byte-for-byte rather than serializing fallback values');

const storageRecoveryContext = vm.createContext({
  safeStorageGet: key => '{broken json',
  storageRecoveryRequired: false,
  console: { warn: () => {} }
});
vm.runInContext(extractFunction(app, 'safeStorageJSON'), storageRecoveryContext);
assert.equal(storageRecoveryContext.safeStorageJSON('a_active_practice_v1', null, () => true), null);
assert.equal(storageRecoveryContext.storageRecoveryRequired, true,
  'malformed local storage JSON must activate the recovery lock before future writes can replace the original bytes');

const practiceAutosaves=[];
const browserHandlerContext = vm.createContext({
  state: null,
  document: { querySelectorAll: () => [], querySelector: () => null },
  render: () => {},
  Store: { saveActivePractice: value => { practiceAutosaves.push(value); return true; } },
  LETTERS: ['A','B','C','D','E','F']
});
const answeredContext = vm.createContext({ Set, Number, String, Array });
vm.runInContext(extractFunction(app, 'isAnswered'), answeredContext);
const isAnsweredUnderTest = answeredContext.isAnswered;
const resumableOrderQuestion = {
  id:'ordered-q', level:'小学', type:'order',
  options:['甲','乙','丙'], answer:[2,0,1]
};
const resumeContext = vm.createContext({
  Store: { getActivePractice: () => resumeContext.saved },
  Q: [resumableOrderQuestion],
  state: {},
  Map, alert: message => { resumeContext.alerts.push(message); },
  go: page => { resumeContext.routes.push(page); },
  isAnswered: isAnsweredUnderTest
});
resumeContext.alerts = [];
resumeContext.routes = [];
resumeContext.saved = {
  level:'小学', questionIds:['ordered-q'], index:0, userAnswers:[[2]],
  evaluated:[true], correct:0, wrong:1, label:'旧版排序练习'
};
vm.runInContext(extractFunction(app, 'resumePractice'), resumeContext);
resumeContext.resumePractice();
assert.equal(resumeContext.routes.length, 0,
  'legacy partial ordering already marked as graded must not resume with an irreversible wrong result');
assert.equal(resumeContext.alerts.length, 1);
assert.match(resumeContext.alerts[0], /原存档已保留/);
resumeContext.saved = {
  level:'小学', questionIds:['ordered-q'], index:0, userAnswers:[[2]],
  evaluated:[false], correct:0, wrong:0, label:'可继续的排序草稿'
};
resumeContext.resumePractice();
assert.equal(resumeContext.routes.at(-1), 'practice',
  'an incomplete but not-yet-graded draft must remain resumable');
assert.deepEqual(Array.from(resumeContext.state.practice.userAnswers[0]), [2]);
assert.equal(resumeContext.state.practice.evaluated[0], false);
const orderedQuestionForValidation = { type: 'order', options: ['甲','乙','丙'] };
assert.equal(isAnsweredUnderTest(orderedQuestionForValidation, [2]), false,
  'a partial ordering sequence must remain unanswered, not receive a wrong score');
assert.equal(isAnsweredUnderTest(orderedQuestionForValidation, [2, 0]), false,
  'an ordering sequence missing an option must remain incomplete');
assert.equal(isAnsweredUnderTest(orderedQuestionForValidation, [2, 0, 0]), false,
  'duplicate option indexes must not count as a completed ordering response');
assert.equal(isAnsweredUnderTest(orderedQuestionForValidation, [2, 0, 1]), true,
  'a complete permutation must count as an answered ordering response');
assert.equal(isAnsweredUnderTest(orderedQuestionForValidation, [2, 0, 3]), false,
  'out-of-range option indexes must not count as a completed ordering response');

const multiQuestionForValidation = { type: 'multi', options: ['甲','乙','丙'] };
assert.equal(isAnsweredUnderTest(multiQuestionForValidation, [0]), true,
  'a valid partial multi-select choice is an intentional answer');
assert.equal(isAnsweredUnderTest(multiQuestionForValidation, [0, 0]), false,
  'duplicate multi-select indexes must not count as a valid answer');
assert.equal(isAnsweredUnderTest(multiQuestionForValidation, [3]), false,
  'multi-select indexes must be bounded by the current question options');
const singleQuestionForValidation = { type: 'single', options: ['甲','乙'] };
assert.equal(isAnsweredUnderTest(singleQuestionForValidation, 1), true);
assert.equal(isAnsweredUnderTest(singleQuestionForValidation, 2), false,
  'stale single-choice indexes must not count as answered');
assert.equal(isAnsweredUnderTest(singleQuestionForValidation, '1'), false,
  'answer option indexes must be numeric');
const judgeQuestionForValidation = { type: 'judge', options: null };
assert.equal(isAnsweredUnderTest(judgeQuestionForValidation, 0), true);
assert.equal(isAnsweredUnderTest(judgeQuestionForValidation, 2), false,
  'binary questions accept only the two documented answer indexes');
const imageQuestionForValidation = { type: 'image', options: ['图一','图二'] };
assert.equal(isAnsweredUnderTest(imageQuestionForValidation, 1), true);
assert.equal(isAnsweredUnderTest(imageQuestionForValidation, 3), false,
  'image-choice answers must be within the supplied option range');

vm.runInContext(extractFunction(app, 'pChoose'), browserHandlerContext);
vm.runInContext(extractFunction(app, 'eChoose'), browserHandlerContext);
const optionQuestion = { type: 'single', answer: 1, options: ['甲','乙','丙'] };
browserHandlerContext.state = { practice: {
  list: [optionQuestion], index: 0, userAnswers: [null], showAnswer: false
}, exam: null };
browserHandlerContext.pChoose(1);
assert.equal(browserHandlerContext.state.practice.userAnswers[0], 1,
  'practice click handler must store a numeric option index');
assert.equal(grade(optionQuestion, browserHandlerContext.state.practice.userAnswers[0], norm), true,
  'practice click result must satisfy strict single-choice grading');

browserHandlerContext.state.exam = {
  list: [optionQuestion], index: 0, answers: [null]
};
browserHandlerContext.eChoose(1);
assert.equal(browserHandlerContext.state.exam.answers[0], 1,
  'exam click handler must store a numeric option index');
assert.equal(grade(optionQuestion, browserHandlerContext.state.exam.answers[0], norm), true,
  'exam click result must satisfy strict single-choice grading');

const multiQuestion = { type: 'multi', answer: [0, 2], options: ['甲','乙','丙'] };
browserHandlerContext.state.practice = {
  list: [multiQuestion], index: 0, userAnswers: [null], showAnswer: false
};
browserHandlerContext.pChoose(0);
browserHandlerContext.pChoose(2);
assert.deepEqual(Array.from(browserHandlerContext.state.practice.userAnswers[0]), [0, 2],
  'practice multi-select handler must preserve numeric indexes');
assert.equal(grade(multiQuestion, browserHandlerContext.state.practice.userAnswers[0], norm), true,
  'practice multi-select result must satisfy order-independent grading');

const orderQuestion = { type: 'order', answer: [2, 0, 1], options: ['甲','乙','丙'] };
browserHandlerContext.state.exam = {
  list: [orderQuestion], index: 0, answers: [null]
};
browserHandlerContext.eChoose(2);
browserHandlerContext.eChoose(0);
browserHandlerContext.eChoose(1);
assert.deepEqual(Array.from(browserHandlerContext.state.exam.answers[0]), [2, 0, 1],
  'exam ordering handler must preserve numeric indexes and the selected sequence');
assert.equal(grade(orderQuestion, browserHandlerContext.state.exam.answers[0], norm), true,
  'exam ordering result must satisfy strict sequence grading');
browserHandlerContext.state.practice = {
  list: [orderQuestion], index: 0, userAnswers: [null], showAnswer: false
};
browserHandlerContext.pChoose(2);
browserHandlerContext.pChoose(0);
browserHandlerContext.pChoose(1);
assert.deepEqual(Array.from(browserHandlerContext.state.practice.userAnswers[0]), [2, 0, 1],
  'practice ordering interaction must preserve the selected sequence');
assert.equal(grade(orderQuestion, browserHandlerContext.state.practice.userAnswers[0], norm), true,
  'practice ordering answer must pass the shared exact-sequence grader');
assert.ok(practiceAutosaves.length>=6,
  'single, multi-select and ordering interactions must each write a recoverable session snapshot');


const renderContext = vm.createContext({
  esc: value => String(value == null ? '' : value),
  LETTERS: ['A','B','C','D','E','F'],
  questionOptions: question => question.type === 'judge' ? ['正确','错误'] : question.options
});
vm.runInContext(inputSource, renderContext);
for (const callback of ['pChoose', 'eChoose']) {
  const markup = renderContext.renderInput(optionQuestion, null, false, callback);
  assert.match(markup, new RegExp('onclick="' + callback + '\\(1\\)"'),
    callback + ' answer UI must emit a numeric index in its click callback');
}
console.log('Browser answer-handler integration checks passed.');


// Practice sessions support going back without losing draft answers or
// counting a previously evaluated question a second time.
assert.ok(html.includes('observatory-learning-console-v2.css?v=20261022-command-center-v6') &&
          html.includes('study-command-center.css?v=20261022-learning-readiness-v1') &&
          html.includes('practice-session-v9.css?v=20261019-v9'),
  'astronomy app must load its product-native observatory, learning command center and practice styles');
assert.ok(!html.includes('product-system-v9.css'),
  'retired generic V9 overlay must not be reintroduced into the native observatory shell');
assert.ok(app.includes('evaluated: new Array(list.length).fill(false)') &&
          app.includes('function pPrev()') &&
          app.includes('已判分 · 不重复计分') &&
          app.includes('仍有 '),
  'practice mode must retain per-question evaluation state and safe backward navigation');
for (const selector of [
  '.w5-practice-head', '.w5-practice-progress',
  '.w5-practice-question', '.w5-practice-actions'
]) assert.ok(fs.readFileSync('assets/css/practice-session-v9.css','utf8').includes(selector),
  'V9 practice session stylesheet must style ' + selector);

let practiceLastAlert='';
const practiceContext=vm.createContext({
  state:{practice:{
    list:[{id:'q1'},{id:'q2'}],index:0,
    userAnswers:['A','B'],evaluated:[false,false],
    showAnswer:false,correct:0,wrong:0,submitting:false
  }},
  isAnswered:()=>true,
  isCorrect:(_q,answer)=>answer==='A',
  Store:{
    bumpQStat(){this.bumpCount++;},
    bumpCount:0,
    addRecord(){this.recordCount++;},
    clearActivePractice(){return true;},
    saveActivePractice(){return true;},
    recordCount:0
  },
  recordQuestionOutcome:async()=>{},
  render(){},
  alert(message){practiceLastAlert=message;},
  confirm:()=>false,
  go(){},
  shuffle:list=>list,
  rate:(a,b)=>Math.round(a/b*100)
});
vm.runInContext('async '+extractFunction(app,'pSubmit'),practiceContext);
for(const name of ['pNext','pPrev','pFinish']){
  vm.runInContext(extractFunction(app,name),practiceContext);
}
(async()=>{
  await practiceContext.pSubmit();
  assert.equal(practiceContext.state.practice.evaluated[0],true);
  assert.equal(practiceContext.state.practice.correct,1);
  assert.equal(practiceContext.Store.bumpCount,1);
  practiceContext.pNext();
  assert.equal(practiceContext.state.practice.index,1);
  practiceContext.pPrev();
  assert.equal(practiceContext.state.practice.index,0);
  assert.equal(practiceContext.state.practice.showAnswer,true,
    'going back to an evaluated question must reopen its explanation');
  await practiceContext.pSubmit();
  assert.equal(practiceContext.state.practice.correct,1,
    'revisiting and submitting an evaluated question cannot add a second score');
  assert.equal(practiceContext.Store.bumpCount,1,
    'revisiting an evaluated question cannot duplicate mastery statistics');
  practiceContext.state.practice.evaluated[1]=false;
  practiceContext.pFinish();
  assert.match(practiceLastAlert,/尚未完成判分/,
    'the session cannot finish while any question remains unevaluated');
  assert.equal(practiceContext.Store.recordCount,0,
    'an incomplete practice session must not be recorded as complete');
  console.log('Practice navigation and no-duplicate-scoring regression checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
