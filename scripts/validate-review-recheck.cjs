'use strict';
// 毕业抽检（+14d/+45d）与逐次作答流水的回归校验：
// 在 VM 里加载应用真实的存储层与 recordQuestionOutcome，注入真实 domain 调度器，
// 用可控的 localStorage 替身逐项断言状态迁移。
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const storageStart = app.indexOf('var KEY = {');
const storageEnd = app.indexOf('\n/* ==========================================\n   知识卡片', storageStart);
assert.ok(storageStart >= 0 && storageEnd > storageStart, 'storage section must exist');
const reviewStart = app.indexOf('var reviewSchedulerPromise = null;');
const reviewEnd = app.indexOf('\n/* ==========================================\n   竞赛', reviewStart);
assert.ok(reviewStart >= 0 && reviewEnd > reviewStart, 'review scheduler section must exist');
const source = app.slice(storageStart, storageEnd) + '\n' + app.slice(reviewStart, reviewEnd) +
  '\n;this.api={Store:Store,recordQuestionOutcome:recordQuestionOutcome,appendAttemptLog:appendAttemptLog,' +
  'readAttemptLog:readAttemptLog,isGraduatedStorageList:isGraduatedStorageList,' +
  'injectDomain:function(m){reviewSchedulerPromise=Promise.resolve(m);},' +
  'ATTEMPT_LOG_KEY:ATTEMPT_LOG_KEY,ATTEMPT_LOG_LIMIT:ATTEMPT_LOG_LIMIT};';

function makeContext(storage) {
  const sandbox = {
    localStorage: storage,
    console: { warn() {}, error() {} },
    alert() {},
    showLocalFileNotice() {}
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.api;
}
function makeStorage(options = {}) {
  const data = new Map();
  return {
    data,
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => {
      if (options.throwOnSet && options.throwOnSet(key)) throw new Error('storage denied');
      data.set(key, String(value));
    },
    removeItem: key => data.delete(key)
  };
}
const DAY = 86400000;

async function main() {
  const domain = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'domain', 'index.js')).href);

  // 1) 连对第 3 次毕业 → 生成毕业记录与 +14 天第一次抽检；流水快照为 wrong 账本状态。
  {
    const storage = makeStorage();
    const api = makeContext(storage);
    api.injectDomain(domain);
    api.Store.addWrong('p001');
    const row = api.Store.getWrong()[0];
    assert.equal(api.Store.scheduleWrongReview('p001', {
      intervalDays: 3, nextReviewAt: row.lastTime + 3 * DAY,
      correctStreak: 2, lastReviewAt: row.lastTime, lastOutcome: 'correct'
    }), true);
    await api.recordQuestionOutcome('p001', true);
    assert.equal(api.Store.getWrong().length, 0, 'graduated item must leave the wrong book');
    const graduated = api.Store.getGraduated();
    assert.equal(graduated.length, 1, 'graduation must create a recheck record');
    assert.equal(graduated[0].id, 'p001');
    assert.equal(graduated[0].recheckStage, 1);
    assert.equal(graduated[0].nextReviewAt - graduated[0].graduatedAt, 14 * DAY,
      'first recheck must be scheduled at graduation +14 days');
    const log = api.readAttemptLog();
    assert.equal(log.length, 1);
    assert.equal(log[0].id, 'p001');
    assert.equal(log[0].correct, true);
    assert.equal(log[0].state.book, 'wrong');
    assert.equal(log[0].state.correctStreak, 2, 'attempt log must snapshot the pre-answer schedule state');

    // 2) 抽检未到期时答对：维持毕业与原抽检计划不变。
    const before = api.Store.getGraduated()[0];
    await api.recordQuestionOutcome('p001', true);
    const after = api.Store.getGraduated()[0];
    assert.equal(after.recheckStage, 1);
    assert.equal(after.nextReviewAt, before.nextReviewAt, 'not-yet-due recheck must keep its schedule');
    assert.equal(api.readAttemptLog().at(-1).state.book, 'graduated');
  }

  // 3) 抽检到期答对 → 推进到第二次抽检（毕业 +45 天）；第二次答对 → 彻底毕业。
  {
    const storage = makeStorage();
    const api = makeContext(storage);
    api.injectDomain(domain);
    const graduatedAt = Date.now() - 20 * DAY;
    storage.data.set('a_g_v6', JSON.stringify([{
      id: 'p002', graduatedAt, recheckStage: 1, nextReviewAt: graduatedAt + 14 * DAY
    }]));
    await api.recordQuestionOutcome('p002', true);
    let graduated = api.Store.getGraduated();
    assert.equal(graduated.length, 1);
    assert.equal(graduated[0].recheckStage, 2, 'passing the first recheck must advance to stage 2');
    assert.equal(graduated[0].nextReviewAt, graduatedAt + 45 * DAY,
      'second recheck must be scheduled at graduation +45 days');
    storage.data.set('a_g_v6', JSON.stringify([{
      id: 'p002', graduatedAt: Date.now() - 50 * DAY, recheckStage: 2, nextReviewAt: Date.now() - 5 * DAY
    }]));
    await api.recordQuestionOutcome('p002', true);
    assert.equal(api.Store.getGraduated().length, 0, 'passing the second recheck must retire the record');
    assert.equal(api.Store.getWrong().length, 0, 'a fully graduated item must not re-enter the wrong book');
  }

  // 4) 抽检答错 → 移除毕业记录，按现有规则重新进入错题本（间隔 1 天、连续答对清零）。
  {
    const storage = makeStorage();
    const api = makeContext(storage);
    api.injectDomain(domain);
    const graduatedAt = Date.now() - 20 * DAY;
    storage.data.set('a_g_v6', JSON.stringify([{
      id: 'p003', graduatedAt, recheckStage: 1, nextReviewAt: graduatedAt + 14 * DAY
    }]));
    const before = Date.now();
    await api.recordQuestionOutcome('p003', false);
    assert.equal(api.Store.getGraduated().length, 0, 'a failed recheck must drop the graduation record');
    const wrong = api.Store.getWrong();
    assert.equal(wrong.length, 1, 'a failed recheck must re-enter the wrong book');
    assert.equal(wrong[0].intervalDays, 1);
    assert.equal(wrong[0].correctStreak, 0);
    assert.ok(Math.abs(wrong[0].nextReviewAt - (before + DAY)) < 10000,
      're-entry must restart from the standard 1-day interval');
    assert.equal(api.readAttemptLog().at(-1).state.book, 'graduated');
  }

  // 5) 无任何账本记录的题目答对：不建档，但流水记为 book:'none'。
  {
    const storage = makeStorage();
    const api = makeContext(storage);
    api.injectDomain(domain);
    await api.recordQuestionOutcome('p999', true);
    assert.equal(api.Store.getWrong().length, 0);
    assert.equal(api.Store.getGraduated().length, 0);
    const log = api.readAttemptLog();
    assert.equal(log.length, 1);
    assert.deepEqual(log[0].state.book, 'none');
  }

  // 6) 流水滚动截断：预填 2000 条后追加 1 条，总量仍为 2000 且最旧一条被挤掉。
  {
    const storage = makeStorage();
    const api = makeContext(storage);
    api.injectDomain(domain);
    const filler = Array.from({ length: 2000 }, (_, i) => ({ id: 'x' + i, correct: true, at: i, state: { book: 'none' } }));
    storage.data.set(api.ATTEMPT_LOG_KEY, JSON.stringify(filler));
    await api.recordQuestionOutcome('p001', false);
    const log = api.readAttemptLog();
    assert.equal(log.length, 2000, 'attempt log must be capped at 2000 entries');
    assert.equal(log[0].id, 'x1', 'the oldest entry must be dropped first');
    assert.equal(log.at(-1).id, 'p001');
    assert.equal(api.ATTEMPT_LOG_LIMIT, 2000);
  }

  // 7) 流水落盘失败（隐私模式等）静默降级：不抛错、不影响错题调度落盘。
  {
    const storage = makeStorage({ throwOnSet: key => key === 'a_attempts_v1' });
    const api = makeContext(storage);
    api.injectDomain(domain);
    assert.equal(api.appendAttemptLog({ id: 'p004', correct: false, at: 1, state: { book: 'none' } }), false,
      'attempt log write failure must be reported as a soft false, never thrown');
    await api.recordQuestionOutcome('p004', false);
    assert.equal(api.Store.getWrong().length, 1, 'scheduling must persist even when the attempt log cannot');
    assert.equal(api.readAttemptLog().length, 0);
  }

  // 8) 毕业记录校验器：接受系统生成的记录，拒绝越界阶段与缺字段。
  {
    const api = makeContext(makeStorage());
    const valid = { id: 'p001', graduatedAt: 1760000000000, recheckStage: 1, nextReviewAt: 1761209600000 };
    assert.equal(api.isGraduatedStorageList([valid]), true);
    assert.equal(api.isGraduatedStorageList([{ ...valid, recheckStage: 3 }]), false);
    assert.equal(api.isGraduatedStorageList([{ ...valid, recheckStage: 0 }]), false);
    assert.equal(api.isGraduatedStorageList([{ id: 'p001', recheckStage: 1, nextReviewAt: 1 }]), false);
    assert.equal(api.isGraduatedStorageList([{ ...valid, lastRecheckAt: -1 }]), false);
  }

  console.log('Review recheck (+14d/+45d) and attempt-log checks passed.');
}

main().catch(error => { console.error(error); process.exit(1); });
