'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8') + '\n' + fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const start = html.indexOf('var storageRecoveryRequired = false;');
const end = html.indexOf('\n/* ==========================================\n   知识卡片', start);
assert.ok(start >= 0 && end > start, 'storage guard section must exist');
const source = html.slice(start, end);
function makeContext(storage) {
  const listeners = {};
  const sandbox = { localStorage: storage, listeners, window: { addEventListener(type, listener) { listeners[type] = listener; } },
    console: { warn() {} },
    KEY:{wrong:'a_w_v6',record:'a_r_v6',days:'a_d_v6',qstats:'a_q_v6',ai:'a_ai_v6',prefs:'a_prefs_v6',practice:'a_active_practice_v1',graduated:'a_g_v6'} };
  vm.runInNewContext("var ATTEMPT_LOG_KEY='a_attempts_v1'; var ATTEMPT_LOG_LIMIT=2000;\n" + source + '\nthis.api={safeStorageGet,safeStorageSet,safeStorageRemove,safeStorageJSON,buildRawLearningRecoveryPacket,readAttemptLog,appendAttemptLog,isAttemptLogEntry,isAttemptLogStorage,isWrongStorageList,isQuestionStatsStorage,isPracticeRecordStorage,isStudyDayStorage,isAIConversationStorage,isPreferenceStorage,isActivePracticeStorage,Store,dispatchStorage(event){if(listeners.storage)listeners.storage(event);},get locked(){return storageRecoveryRequired;},get attemptLogLocked(){return attemptLogRecoveryRequired;},get conflictDetected(){return storageConflictDetected;},resetRecoveryLockForTest(){storageRecoveryRequired=false;attemptLogRecoveryRequired=false;storageConflictDetected=false;}};', sandbox);
  return sandbox.api;
}
{
  const data = new Map([['a_r_v6', '{broken-json']]);
  const api = makeContext({
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  });
  assert.equal(api.safeStorageGet('a_r_v6'), '{broken-json');
  assert.equal(api.locked, true, 'malformed persisted JSON must activate recovery lock');
  assert.equal(api.safeStorageSet('a_r_v6', '[]'), false);
  assert.equal(api.safeStorageRemove('a_r_v6'), false);
  assert.equal(data.get('a_r_v6'), '{broken-json', 'original malformed value must remain untouched');
}
{
  const api = makeContext({
    getItem() { throw new Error('storage disabled'); },
    setItem() { throw new Error('must not write'); },
    removeItem() { throw new Error('must not remove'); }
  });
  assert.equal(api.safeStorageGet('a_r_v6'), null);
  assert.equal(api.locked, true, 'storage read failure must activate recovery lock');
  assert.equal(api.safeStorageSet('a_r_v6', '[]'), false);
  assert.equal(api.safeStorageRemove('a_r_v6'), false);
}
{
  const data = new Map([['a_r_v6', '[{"total":3}]']]);
  const api = makeContext({
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  });
  assert.equal(api.safeStorageGet('a_r_v6'), '[{"total":3}]');
  assert.equal(api.locked, false, 'valid JSON must not activate recovery lock');
  assert.equal(api.safeStorageSet('a_r_v6', '[{"total":4}]'), true);
  assert.equal(data.get('a_r_v6'), '[{"total":4}]');
}
{
  const data = new Map();
  const storage = {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  };
  const api = makeContext(storage);
  data.set('a_attempts_v1', '[]');
  api.dispatchStorage({ key: 'a_attempts_v1', oldValue: null, newValue: '[]', storageArea: storage });
  assert.equal(api.attemptLogLocked, true, 'a cross-tab attempt-log update must isolate only the optional sidecar');
  assert.equal(api.locked, false, 'an attempt-log conflict must not freeze the primary learning ledger');
  assert.equal(api.Store.savePrefs({ speed: 1.2, volume: 0.8, pitch: 1.1, aiModel: 'general' }), true,
    'primary learning settings remain writable after an isolated attempt-log conflict');
}
{
  const data = new Map([['a_r_v6', '[]']]);
  const storage = {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  };
  const api = makeContext(storage);
  const peerValue = '[{"mode":"practice","total":1,"correct":1,"sessionId":"peer-tab"}]';
  data.set('a_r_v6', peerValue);
  api.dispatchStorage({ key: 'a_r_v6', oldValue: '[]', newValue: peerValue, storageArea: storage });
  assert.equal(api.locked, true, 'a cross-tab learning-ledger update must lock stale-tab writes');
  assert.equal(api.conflictDetected, true, 'the UI must distinguish a cross-tab conflict from corrupt JSON');
  assert.equal(api.safeStorageSet('a_r_v6', '[]'), false, 'stale-tab writes must be refused');
  assert.equal(data.get('a_r_v6'), peerValue, 'the newer peer-tab value must remain untouched');
}
{
  const api = makeContext({ getItem: () => null, setItem() {}, removeItem() {} });
  api.dispatchStorage({ key: null, oldValue: null, newValue: null });
  assert.equal(api.locked, true, 'a cross-tab localStorage.clear() must lock the primary ledger');
  assert.equal(api.attemptLogLocked, true, 'a cross-tab localStorage.clear() must isolate the attempt sidecar');
}
{
  const data = new Map([['a_r_v6', '[]']]);
  const storage = {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  };
  const api = makeContext(storage);
  assert.equal(api.safeStorageGet('a_r_v6'), '[]');
  const peerValue = '[{"sessionId":"peer-write-before-storage-event"}]';
  // Simulate the interval after a peer write but before this tab receives its
  // asynchronous storage event. The preflight read must still reject a stale write.
  data.set('a_r_v6', peerValue);
  assert.equal(api.safeStorageSet('a_r_v6', '[]'), false,
    'a stale read-modify-write must be refused even before the storage event arrives');
  assert.equal(api.locked, true);
  assert.equal(api.conflictDetected, true);
  assert.equal(data.get('a_r_v6'), peerValue,
    'the peer value must survive a pre-event stale-write attempt');
}
{
  const data = new Map([['a_r_v6', '[]']]);
  const storage = {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  };
  const api = makeContext(storage);
  api.safeStorageGet('a_r_v6');
  data.set('a_r_v6', '[{"sessionId":"peer-delete-protection"}]');
  assert.equal(api.safeStorageRemove('a_r_v6'), false,
    'a stale delete must be refused even before the storage event arrives');
  assert.equal(data.get('a_r_v6'), '[{"sessionId":"peer-delete-protection"}]');
}
console.log('Study storage recovery checks passed (malformed JSON, inaccessible storage, valid storage).');

{
  const raw = '{"wrong":"shape"}';
  const data = new Map([['a_w_v6', raw]]);
  const api = makeContext({
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  });
  const fallback = api.safeStorageJSON('a_w_v6', [], api.isWrongStorageList);
  assert.equal(Array.isArray(fallback), true);
  assert.equal(api.locked, true, 'valid JSON with the wrong top-level shape must activate recovery lock');
  assert.equal(data.get('a_w_v6'), raw, 'wrong-shaped original data must remain untouched');
  assert.equal(api.safeStorageSet('a_w_v6', '[]'), false);
}
{
  const raw = '[null]';
  const data = new Map([['a_w_v6', raw]]);
  const api = makeContext({
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  });
  api.safeStorageJSON('a_w_v6', [], api.isWrongStorageList);
  assert.equal(api.locked, true, 'malformed entries inside a valid array must activate recovery lock');
}
{
  const api = makeContext({
    getItem: key => key === 'a_w_v6' ? '[{"id":"p001","count":2,"lastTime":1760000000000}]' : null,
    setItem() {},
    removeItem() {}
  });
  const valid = api.safeStorageJSON('a_w_v6', [], api.isWrongStorageList);
  assert.equal(valid.length, 1);
  assert.equal(api.locked, false, 'a well-formed learning record must remain readable');
}


{
  const legacyWrong=[{id:'p001',count:2,lastTime:1760000000000}];
  const scheduledWrong=[{
    id:'p002',count:1,lastTime:1760000000000,
    intervalDays:3,nextReviewAt:1760259200000,correctStreak:2,
    lastReviewAt:1760000000000,lastOutcome:'correct'
  }];
  const api=makeContext({getItem:()=>null,setItem(){},removeItem(){}});
  assert.equal(api.isWrongStorageList(legacyWrong),true,
    'legacy wrong-book rows without review metadata must remain readable');
  assert.equal(api.isWrongStorageList(scheduledWrong),true,
    'scheduled wrong-book rows must preserve their interval, due time and streak');
  for(const invalid of [
    {...scheduledWrong[0],intervalDays:0},
    {...scheduledWrong[0],intervalDays:3651},
    {...scheduledWrong[0],nextReviewAt:-1},
    {...scheduledWrong[0],correctStreak:3},
    {...scheduledWrong[0],lastOutcome:'unknown'}
  ]){
    assert.equal(api.isWrongStorageList([invalid]),false,
      'malformed spaced-review metadata must be rejected without invalidating valid legacy rows');
  }
}
{
  const data=new Map();
  const api=makeContext({
    getItem:key=>data.has(key)?data.get(key):null,
    setItem:(key,value)=>data.set(key,value),
    removeItem:key=>data.delete(key)
  });
  assert.equal(api.Store.addWrong('p001'),true,'a new wrong answer must create a review row');
  let item=api.Store.getWrong()[0];
  assert.equal(item.intervalDays,1);
  assert.equal(item.correctStreak,0);
  assert.equal(item.lastOutcome,'incorrect');
  assert.ok(item.nextReviewAt>item.lastTime,'a new wrong answer must have a due date');
  const plan={
    intervalDays:5,nextReviewAt:item.lastTime+5*86400000,
    correctStreak:2,lastReviewAt:item.lastTime+1,lastOutcome:'correct'
  };
  assert.equal(api.Store.scheduleWrongReview('p001',plan),true);
  item=api.Store.getWrong()[0];
  assert.equal(item.intervalDays,5);
  assert.equal(item.correctStreak,2);
  assert.equal(item.lastOutcome,'correct');
  assert.equal(item.nextReviewAt,plan.nextReviewAt);
  const before=data.get('a_w_v6');
  assert.equal(api.Store.scheduleWrongReview('p001',{...plan,correctStreak:3}),false,
    'review plans must reject invalid consecutive-correct streaks');
  assert.equal(data.get('a_w_v6'),before,'invalid review metadata must not replace the valid schedule');
}
{
  const data = new Map();
  let writes = 0;
  const api = makeContext({
    getItem:key=>data.has(key)?data.get(key):null,
    setItem:(key,value)=>{writes++;data.set(key,value);},
    removeItem:key=>data.delete(key)
  });
  assert.equal(api.Store.savePrefs({speed:1.2,volume:0.8,pitch:1.1,aiModel:'general'}),true,
    'valid preferences must persist');
  assert.equal(writes,1);
  assert.deepEqual(JSON.parse(data.get('a_prefs_v6')),{speed:1.2,volume:0.8,pitch:1.1,aiModel:'general'});
  for (const invalid of [
    {speed:0.5},{speed:1.9},{volume:0.2},{volume:1.1},{pitch:0.6},{pitch:1.5},
    {aiModel:'non-existent'},{speed:1,unexpected:true},null
  ]) {
    const before=data.get('a_prefs_v6');
    assert.equal(api.Store.savePrefs(invalid),false,'invalid preferences must be rejected');
    assert.equal(data.get('a_prefs_v6'),before,'invalid preferences must not replace the last valid value');
  }
  assert.equal(writes,1,'rejected preferences must not call localStorage.setItem');
  assert.equal(api.locked,false,'rejected form input is not proof that stored data is corrupted');
}


{
  const session={
    version:1,level:'小学',label:'太阳系专项练习',
    questionIds:['p001','p002','p003'],
    userAnswers:[1,null,[0,2]],
    evaluated:[true,false,false],
    index:1,correct:1,wrong:0,updatedAt:1760000000000
  };
  const api=makeContext({getItem:()=>null,setItem(){},removeItem(){}});
  assert.equal(api.isActivePracticeStorage(session),true,
    'a valid resumable practice session must pass the strict versioned schema');
  for(const invalid of [
    {...session,version:2},
    {...session,questionIds:['p001','p001']},
    {...session,userAnswers:[1,null]},
    {...session,evaluated:[true,'false',false]},
    {...session,correct:0,wrong:0},
    {...session,index:3},
    {...session,userAnswers:[{answer:1},null,[0,2]]}
  ]){
    assert.equal(api.isActivePracticeStorage(invalid),false,
      'malformed session state must be rejected without modifying other learner data');
  }
}
{
  const data=new Map();
  const api=makeContext({
    getItem:key=>data.has(key)?data.get(key):null,
    setItem:(key,value)=>data.set(key,value),
    removeItem:key=>data.delete(key)
  });
  const session={
    list:[{id:'p001'},{id:'p002'}],
    userAnswers:[0,null],evaluated:[true,false],
    index:1,correct:1,wrong:0,level:'小学',label:'星座强化练习'
  };
  assert.equal(api.Store.saveActivePractice(session),true,
    'practice autosave must persist to its independent storage key');
  const saved=JSON.parse(data.get('a_active_practice_v1'));
  assert.equal(saved.version,1);
  assert.deepEqual(saved.questionIds,['p001','p002']);
  assert.equal(api.Store.getActivePractice().label,'星座强化练习');
  assert.equal(api.Store.clearActivePractice(),true);
  assert.equal(data.has('a_active_practice_v1'),false,
    'clearing a practice draft must not clear question statistics or wrong-book data');
}


{
  const submitStart=html.indexOf('async function pSubmit()');
  const submitEnd=html.indexOf('\nfunction pNext()',submitStart);
  assert.ok(submitStart>=0&&submitEnd>submitStart,'practice submit handler must remain discoverable');
  const submit=html.slice(submitStart,submitEnd);
  const persistAt=submit.indexOf('if (!Store.saveActivePractice(p))');
  const statsAt=submit.indexOf('Store.bumpQStat(q.id, ok)');
  assert.ok(persistAt>=0&&statsAt>persistAt,
    'practice session must persist successfully before secondary statistics are updated');
  assert.ok(submit.includes('p.evaluated[p.index]=false'));
  assert.ok(submit.includes('if (ok) p.correct--; else p.wrong--;'),
    'failed practice persistence must roll back the in-memory score');
}


{
  const data = new Map();
  const storage = {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  };
  const api = makeContext(storage);
  const session = {
    list: [{id:'p100'}], userAnswers: [0], evaluated: [true],
    index: 0, correct: 1, wrong: 0, level: '小学', label: '幂等完成测试'
  };
  assert.equal(api.Store.saveActivePractice(session), true);
  const saved = JSON.parse(data.get('a_active_practice_v1'));
  assert.equal(typeof saved.sessionId, 'string');
  assert.ok(saved.sessionId.length > 0);
  const record = {
    mode: 'practice', total: 1, correct: 1, sessionId: saved.sessionId
  };
  assert.equal(api.Store.addRecord(record), true);
  assert.equal(api.Store.addRecord(record), true,
    'retrying completion for the same session must be idempotent');
  assert.equal(api.Store.addRecord({ ...record, correct: 0 }), false,
    'a reused session ID with a conflicting score must be rejected, not silently deduplicated');
  const storedRecords = JSON.parse(data.get('a_r_v6'));
  assert.equal(storedRecords.length, 1,
    'one practice session must produce only one result row');
  assert.equal(storedRecords[0].correct, 1,
    'a conflicting retry must not replace the committed result');
}

{
  const data = new Map();
  let failStudyDayOnce = true;
  const storage = {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => {
      if (key === 'a_d_v6' && failStudyDayOnce) {
        failStudyDayOnce = false;
        throw new Error('simulated quota failure on study-day write');
      }
      data.set(key, value);
    },
    removeItem: key => data.delete(key)
  };
  const record = {
    mode: 'practice', total: 2, correct: 2, sessionId: 'session-retry-001'
  };
  const firstLoad = makeContext(storage);
  assert.equal(firstLoad.Store.addRecord(record), false,
    'a secondary study-day write failure must be surfaced');
  assert.equal(JSON.parse(data.get('a_r_v6')).length, 1,
    'the already committed result must remain intact');
  assert.equal(data.has('a_d_v6'), false);

  // A page reload resets the fail-closed in-memory lock. Retrying the same
  // completion must repair the missing day entry without duplicating the row.
  const afterReload = makeContext(storage);
  assert.equal(afterReload.Store.addRecord(record), true);
  assert.equal(JSON.parse(data.get('a_r_v6')).length, 1);
  assert.equal(JSON.parse(data.get('a_d_v6')).length, 1);
}

{
  const oldDraft = {
    version: 1, sessionId: 'old-session', level: '小学', label: '旧练习',
    questionIds: ['p001'], userAnswers: [0], evaluated: [false],
    index: 0, correct: 0, wrong: 0, updatedAt: 1760000000000
  };
  const rawOldDraft = JSON.stringify(oldDraft);
  const data = new Map([['a_active_practice_v1', rawOldDraft]]);
  const api = makeContext({
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => {
      if (key === 'a_active_practice_v1') throw new Error('simulated quota failure replacing active practice');
      data.set(key, value);
    },
    removeItem: key => data.delete(key)
  });
  const replacement = {
    list: [{id:'p002'}], userAnswers: [null], evaluated: [false],
    index: 0, correct: 0, wrong: 0, level: '小学', label: '新练习'
  };
  assert.equal(api.Store.saveActivePractice(replacement), false);
  assert.equal(data.get('a_active_practice_v1'), rawOldDraft,
    'failed replacement must leave the previous resumable draft byte-for-byte intact');
}

{
  const startWithStart = html.indexOf('function startWith(');
  const startWithEnd = html.indexOf('function resumePractice()', startWithStart);
  assert.ok(startWithStart >= 0 && startWithEnd > startWithStart);
  const startWith = html.slice(startWithStart, startWithEnd);
  assert.ok(startWith.includes('if(!Store.saveActivePractice(state.practice))'));
  assert.ok(!startWith.includes('Store.clearActivePractice()'),
    'starting a replacement practice must not delete the previous draft before the new write succeeds');
}

{
  const finishStart = html.indexOf('function pFinish()');
  const finishEnd = html.indexOf('\n\nvar reviewSchedulerPromise', finishStart);
  assert.ok(finishStart >= 0 && finishEnd > finishStart,
    'practice finish handler must remain discoverable');
  const finish = html.slice(finishStart, finishEnd);
  assert.ok(finish.includes('if(!p||p.finishing)return;'),
    'double-clicks must not run concurrent completion writes');
  assert.ok(finish.includes('sessionId:p.sessionId'),
    'completion records must carry a stable session id');
  assert.ok(finish.includes('if(!Store.clearActivePractice())'),
    'the active draft must be cleared only after the result write succeeds');
}


{
  const api = makeContext({
    getItem: () => null,
    setItem() {},
    removeItem() { throw new Error('storage removal denied'); }
  });
  assert.equal(api.safeStorageRemove('a_r_v6'), false,
    'a failed storage removal must be reported rather than treated as successful');
  assert.equal(api.locked, true,
    'a failed storage removal must activate the recovery lock');
}


{
  let writes=0;
  const api=makeContext({
    getItem:()=>null,
    setItem(){writes++;},
    removeItem(){throw new Error('quota or browser policy denied removal');}
  });
  assert.equal(api.safeStorageRemove('a_r_v6'),false);
  assert.equal(api.locked,true);
  assert.equal(api.safeStorageSet('a_r_v6','[]'),false,
    'a successful-looking later write must not bypass the recovery lock');
  assert.equal(writes,0,'no write may be attempted after a failed removal has raised the lock');
}

{
  const data = new Map();
  let failDraftRemovalOnce = true;
  const storage = {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => {
      if (key === 'a_active_practice_v1' && failDraftRemovalOnce) {
        failDraftRemovalOnce = false;
        throw new Error('simulated failure clearing completed practice draft');
      }
      data.delete(key);
    }
  };
  const firstLoad = makeContext(storage);
  const draft = {
    list: [{id:'p200'}], userAnswers: [0], evaluated: [true],
    index: 0, correct: 1, wrong: 0, level: '小学', label: '完成后清理失败重试'
  };
  assert.equal(firstLoad.Store.saveActivePractice(draft), true);
  const savedDraft = JSON.parse(data.get('a_active_practice_v1'));
  const record = {
    mode: 'practice', total: 1, correct: 1, sessionId: savedDraft.sessionId
  };

  assert.equal(firstLoad.Store.addRecord(record), true,
    'the score must be committed before attempting to remove the active draft');
  assert.equal(firstLoad.Store.clearActivePractice(), false,
    'a failed draft removal must be surfaced so the user can retry');
  assert.equal(JSON.parse(data.get('a_r_v6')).length, 1,
    'the score remains committed when draft cleanup fails');
  assert.ok(data.has('a_active_practice_v1'),
    'the resumable draft must remain intact when cleanup fails');

  // A reload resets the fail-closed storage lock. Retrying completion must
  // deduplicate the committed score and then clear the same active session.
  const afterReload = makeContext(storage);
  assert.equal(afterReload.Store.addRecord(record), true);
  assert.equal(JSON.parse(data.get('a_r_v6')).length, 1,
    'retry after cleanup failure must not create a duplicate result');
  assert.equal(afterReload.Store.clearActivePractice(), true);
  assert.equal(data.has('a_active_practice_v1'), false,
    'the retried completion must finally clear the active draft');
}

{
  const attemptsRaw='[{"id":"p001","correct":true,"at":1760000000000,"state":{"book":"none"}}]';
  const data=new Map([['a_r_v6','{broken-json'],['a_attempts_v1',attemptsRaw]]);
  const storage={getItem:key=>data.has(key)?data.get(key):null};
  const api=makeContext(storage);
  const packet=api.buildRawLearningRecoveryPacket(storage);
  const attempts=packet.entries.find(entry=>entry.key==='a_attempts_v1');
  assert.deepEqual({name:attempts.name,key:attempts.key,raw:attempts.raw},
    {name:'attempts',key:'a_attempts_v1',raw:attemptsRaw},
    'raw recovery export must include the independent attempt log byte-for-byte');
  assert.equal(data.get('a_r_v6'),'{broken-json','building a recovery packet must not rewrite malformed source data');
  assert.equal(data.get('a_attempts_v1'),attemptsRaw,'building a recovery packet must not mutate the attempt log');
}
{
  const raw='[{broken-attempt';
  const data=new Map([['a_attempts_v1',raw]]);
  let writes=0;
  const api=makeContext({
    getItem:key=>data.has(key)?data.get(key):null,
    setItem(key,value){writes++;data.set(key,value);}
  });
  assert.equal(api.readAttemptLog().length,0);
  assert.equal(api.locked,false,'malformed optional attempt history must not activate the primary learning-ledger lock');
  assert.equal(api.attemptLogLocked,true,'malformed attempt history must activate its isolated recovery lock');
  assert.equal(api.appendAttemptLog({id:'p002',correct:true,at:1760000000001,state:{book:'none'}}),false);
  assert.equal(writes,0,'malformed attempt history must never be overwritten');
  assert.equal(data.get('a_attempts_v1'),raw,'the exact malformed attempt bytes must remain available for recovery export');
}
{
  const raw='[{"id":"p001","correct":true,"at":1760000000000,"state":{"book":"unknown"}}]';
  const data=new Map([['a_attempts_v1',raw]]);
  let writes=0;
  const api=makeContext({
    getItem:key=>data.has(key)?data.get(key):null,
    setItem(key,value){writes++;data.set(key,value);}
  });
  assert.equal(api.isAttemptLogStorage(JSON.parse(raw)),false);
  assert.equal(api.readAttemptLog().length,0);
  assert.equal(api.locked,false,'structurally invalid optional attempt history must not freeze primary learning records');
  assert.equal(api.attemptLogLocked,true,'structurally invalid attempt history must activate its isolated recovery lock');
  assert.equal(api.appendAttemptLog({id:'p002',correct:true,at:1760000000001,state:{book:'none'}}),false);
  assert.equal(writes,0,'structurally invalid attempt history must never be overwritten');
  assert.equal(data.get('a_attempts_v1'),raw);
}
{
  const data=new Map([['a_attempts_v1','[]']]);
  const api=makeContext({getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,value)});
  assert.equal(api.appendAttemptLog({id:'p003',correct:true,at:1760000000002,state:{book:'none'}}),true);
  assert.equal(api.appendAttemptLog({id:'p004',correct:'yes',at:1760000000003,state:{book:'none'}}),false);
  assert.equal(JSON.parse(data.get('a_attempts_v1')).length,1);
}
