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
  const sandbox = { localStorage: storage, console: { warn() {} },
    KEY:{wrong:'a_w_v6',record:'a_r_v6',days:'a_d_v6',qstats:'a_q_v6',ai:'a_ai_v6',prefs:'a_prefs_v6',practice:'a_active_practice_v1'} };
  vm.runInNewContext(source + '\nthis.api={safeStorageGet,safeStorageSet,safeStorageRemove,safeStorageJSON,isWrongStorageList,isQuestionStatsStorage,isPracticeRecordStorage,isStudyDayStorage,isAIConversationStorage,isPreferenceStorage,isActivePracticeStorage,Store,get locked(){return storageRecoveryRequired;}};', sandbox);
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
