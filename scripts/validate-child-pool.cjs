const fs = require('node:fs');
const assert = require('node:assert/strict');
const bankSource = fs.readFileSync('assets/js/question-bank.js', 'utf8');
const legacyApp = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const manifest = JSON.parse(fs.readFileSync('assets/data/question-evidence.json', 'utf8'));
const fail = message => { console.error(message); process.exitCode = 1; };

// Bank rows use the compact format: [id, level, category, type, ...]
const bank = new Map();
for (const line of bankSource.split(/\r?\n/)) {
  const match = line.match(/^\s*\['([a-z]\d{3})','([^']+)','([^']+)','([^']+)'/);
  if (match) bank.set(match[1], { level: match[2], category: match[3], type: match[4] });
}
assert.equal(bank.size, 300, 'question bank must contain 300 questions');

if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.questions)) fail('Unsupported question evidence manifest schema');
const status = new Map();
for (const item of manifest.questions) {
  if (!item || typeof item.id !== 'string' || !bank.has(item.id)) { fail('Evidence entry references an unknown question: ' + (item && item.id)); continue; }
  if (status.has(item.id)) fail('Duplicate evidence entry: ' + item.id);
  status.set(item.id, item.status);
}
assert.equal(status.size, 300, 'evidence manifest must cover all 300 questions');

// Child pool predicate, mirroring isChildSafeQuestion in legacy-app.js:
// primary level AND evidence status verified. At runtime an unavailable
// evidence manifest means "not verified" (fail-closed); this script validates
// the data side of that contract.
const childPool = [...bank.keys()].filter(id => bank.get(id).level === '小学' && status.get(id) === 'verified');
assert.equal(childPool.length, 144, 'child pool (primary + verified) must contain 144 questions');
assert.equal(childPool.filter(id => status.get(id) !== 'verified').length, 0,
  'child pool must contain zero non-verified questions');
const childSet = new Set(childPool);

// Astronomy intro whitelist, extracted from the shipped legacy-app.js so the
// check binds to the code that actually runs, not a copy kept in this script.
const groupsBlock = legacyApp.match(/var ASTRONOMY_INTRO_GROUPS = \[([\s\S]*?)\];/);
assert.ok(groupsBlock, 'ASTRONOMY_INTRO_GROUPS must be defined in legacy-app.js');
const expectedGroups = [['行星常识', 23], ['月相与月球', 22], ['太阳与食象', 20], ['四季与昼夜', 13], ['观测基础', 32]];
const groups = [];
for (const gm of groupsBlock[1].matchAll(/name:'([^']+)',\s*ids:\[([^\]]*)\]/g)) {
  groups.push({ name: gm[1], ids: [...gm[2].matchAll(/'([a-z]\d{3})'/g)].map(x => x[1]) });
}
assert.deepEqual(groups.map(g => [g.name, g.ids.length]), expectedGroups,
  'astronomy intro groups must match the A3 whitelist composition (23/22/20/13/32)');
const whitelist = groups.flatMap(g => g.ids);
assert.equal(whitelist.length, 110, 'astronomy intro whitelist must contain 110 ids');
assert.equal(new Set(whitelist).size, 110, 'astronomy intro whitelist ids must be unique');
for (const id of whitelist) {
  if (!bank.has(id)) fail('Astronomy intro whitelist references an unknown question: ' + id);
  else if (!childSet.has(id)) fail('Astronomy intro question is not primary+verified: ' + id);
}
const introPool = whitelist.filter(id => childSet.has(id));
assert.equal(introPool.length, 110, 'astronomy intro pool (whitelist ∩ child pool) must contain 110 questions');
assert.equal(introPool.filter(id => status.get(id) !== 'verified').length, 0,
  'astronomy intro pool must contain zero non-verified questions');

// Every non-verified question must be absent from both child pools.
for (const [id, st] of status) {
  if (st === 'verified') continue;
  if (childSet.has(id)) fail('Non-verified question present in child pool: ' + id + ' (' + st + ')');
  if (whitelist.includes(id)) fail('Non-verified question present in astronomy intro whitelist: ' + id + ' (' + st + ')');
}

// Code-binding checks: the shipped app must actually enforce the hard filter.
assert.ok(/function isVerifiedQuestion\(q\)\{\s*if \(questionEvidenceLoadState !== 'ready'\) return false;/.test(legacyApp),
  'isVerifiedQuestion must fail closed while the evidence manifest is not ready');
assert.ok(/function isChildSafeQuestion\(q\)\{\s*return q\.level === '小学' && isVerifiedQuestion\(q\);/.test(legacyApp),
  'isChildSafeQuestion must require primary level and verified status');
assert.ok(/function getQuestions\(level, category\)\{\s*if \(state\.childMode\)/.test(legacyApp),
  'getQuestions must apply the child hard filter while child mode is on');
assert.ok(legacyApp.includes('function startChildPractice('), 'child practice entry must exist');
assert.ok(legacyApp.includes('function startAstronomyIntro('), 'astronomy intro entry must exist');

if (!process.exitCode) {
  console.log('child pool validation passed: child pool 144 (primary + verified, non-verified 0); astronomy intro subset 110 (groups 23/22/20/13/32, non-verified 0)');
}
