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
    KEY:{wrong:'a_w_v6',record:'a_r_v6',days:'a_d_v6',qstats:'a_q_v6',ai:'a_ai_v6',prefs:'a_prefs_v6'} };
  vm.runInNewContext(source + '\nthis.api={safeStorageGet,safeStorageSet,safeStorageRemove,safeStorageJSON,isWrongStorageList,isQuestionStatsStorage,isPracticeRecordStorage,isStudyDayStorage,isAIConversationStorage,isPreferenceStorage,Store,get locked(){return storageRecoveryRequired;}};', sandbox);
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
