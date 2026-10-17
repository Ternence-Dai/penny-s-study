'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('var storageRecoveryRequired = false;');
const end = html.indexOf('\nvar Store =', start);
assert.ok(start >= 0 && end > start, 'storage guard section must exist');
const source = html.slice(start, end);
function makeContext(storage) {
  const sandbox = { localStorage: storage, console: { warn() {} } };
  vm.runInNewContext(source + '\nthis.api={safeStorageGet,safeStorageSet,safeStorageRemove,get locked(){return storageRecoveryRequired;}};', sandbox);
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
