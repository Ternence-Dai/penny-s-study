const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const bankSource = fs.readFileSync('assets/js/question-bank.js', 'utf8');
const classroom = fs.readFileSync('assets/js/astronomy-classroom-v3.js', 'utf8');
const classroomCss = fs.readFileSync('assets/css/study-command-center.css', 'utf8');
const manifest = JSON.parse(fs.readFileSync('assets/data/question-evidence.json', 'utf8'));
const questionRows = new Map();
const rows = bankSource.split(/\r?\n/).map(line => {
  const match = line.match(/^\s*\['([a-z]\d{3})'/);
  if (match) questionRows.set(match[1], line.trim());
  return match ? match[1] : null;
}).filter(Boolean);
const fail = message => { console.error(message); process.exitCode = 1; };
function isValidReviewTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) return false;
  if (match[7] !== 'Z') {
    const hour = Number(match[9]), minute = Number(match[10]);
    if (minute > 59 || hour > 14 || (hour === 14 && minute !== 0) ||
        (match[8] === '-' && hour === 0 && minute === 0)) return false;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const utcYear = new Date(timestamp).getUTCFullYear();
  return utcYear >= 0 && utcYear <= 9999;
}

for (const [value, expected] of [
  ['2026-02-28T12:30:00Z', true],
  ['2024-02-29T12:30:00.123+08:00', true],
  ['2026-02-30T12:30:00Z', false],
  ['2026-01-01T12:30:00+14:30', false],
  ['2026-01-01T12:30:00-00:00', false],
  ['2026-01-01T12:30:00', false],
  ['2026-13-01T12:30:00Z', false],
]) {
  assert.equal(isValidReviewTimestamp(value), expected,
    'review timestamp parser must reject invalid calendar dates and offsets: ' + value);
}

const requiredReviewedFields = ['stem', 'answer', 'explanation'];
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.questions)) fail('Unsupported question evidence manifest schema');
const ids = new Set(rows);
const seen = new Set();
for (const item of manifest.questions) {
  if (!item || typeof item.id !== 'string' || !ids.has(item.id)) { fail('Evidence entry references an unknown question: ' + (item && item.id)); continue; }
  if (seen.has(item.id)) fail('Duplicate evidence entry: ' + item.id);
  seen.add(item.id);
  if (!['review-needed','verified','rejected'].includes(item.status)) fail(item.id + ': invalid evidence status');
  if (!Array.isArray(item.sources)) fail(item.id + ': sources must be an array');
  for (const source of item.sources) {
    if (!source || typeof source.title !== 'string' || !source.title.trim() || typeof source.url !== 'string' || !source.url.startsWith('https://')) fail(item.id + ': source requires a title and HTTPS URL');
    if (source.publisher != null && typeof source.publisher !== 'string') fail(item.id + ': publisher must be text');
  }
  if (item.status === 'review-needed') {
    if (item.reviewer != null || item.reviewedAt != null || item.contentSha256 != null) {
      fail(item.id + ': pending questions must not carry completed review metadata');
    }
    if (!/尚未完成人工逐题核对/.test(item.reviewNote || '')) {
      fail(item.id + ': pending questions must retain the human-review disclaimer');
    }
  }
  if (item.status === 'verified' || item.status === 'rejected') {
    if (!item.sources.length) fail(item.id + ': reviewed questions require at least one source');
    if (typeof item.reviewer !== 'string' || !item.reviewer.trim()) fail(item.id + ': reviewed questions require a reviewer');
    if (!isValidReviewTimestamp(item.reviewedAt)) {
      fail(item.id + ': reviewed questions require a valid ISO timestamp with an explicit timezone and real calendar date');
    }
    if (!Array.isArray(item.reviewedFields) || requiredReviewedFields.some(field => !item.reviewedFields.includes(field)) ||
        new Set(item.reviewedFields).size !== requiredReviewedFields.length || item.reviewedFields.length !== requiredReviewedFields.length) {
      fail(item.id + ': reviewer must explicitly attest to reviewing stem, answer and explanation');
    }
    const expectedHash = crypto.createHash('sha256').update(questionRows.get(item.id), 'utf8').digest('hex');
    if (typeof item.contentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.contentSha256) || item.contentSha256 !== expectedHash) {
      fail(item.id + ': review record is stale or is not bound to the exact current question content');
    }
    if (item.status === 'rejected' && (typeof item.rejectionReason !== 'string' || !item.rejectionReason.trim())) {
      fail(item.id + ': rejected questions require a documented rejection reason');
    }
  }
}
for (const id of ids) if (!seen.has(id)) fail('Missing evidence entry: ' + id);
if (rows.length !== 300 || seen.size !== rows.length) fail('Evidence registry must cover all 300 unique question IDs');

const candidateIds = [
  'p001','p002','p003','p005','p006','p007','p008','p009','p010','p011','p012',
  'p013','p015','p016','p017','p018','p020','p021','p022','p023','p025'
];
for (const id of candidateIds) {
  const item = manifest.questions.find(entry => entry.id === id);
  if (!item || !item.sources.length) fail(id + ': expected at least one authoritative source candidate');
}

const coverage = manifest.questions.reduce((stats, item) => {
  stats[item.status] = (stats[item.status] || 0) + 1;
  stats[item.sources.length ? 'withSources' : 'withoutSources'] += 1;
  return stats;
}, {withSources:0,withoutSources:0});
const reviewedCount = (coverage.verified || 0) + (coverage.rejected || 0) + (coverage['review-needed'] || 0);
if (reviewedCount !== 300) fail('Question review states must account for all 300 questions');
if (coverage.withSources !== 300 || coverage.withoutSources !== 0) {
  fail('Expected source records for all 300 questions: ' + JSON.stringify(coverage));
}

const sourceHostAllowlist = new Set(['science.nasa.gov','nasa.gov','www.nasa.gov','iau.org','www.iau.org','www.ioe.cas.cn','www.iop.cas.cn','ihns.cas.cn','nao.cas.cn','www.cmse.gov.cn','www.cnsa.gov.cn','www.cac.gov.cn','spaceplace.nasa.gov','imagine.gsfc.nasa.gov','science.gsfc.nasa.gov','pmo.cas.cn','nesdis.noaa.gov','www.nesdis.noaa.gov','pressbooks.online.ucf.edu','spacemath.gsfc.nasa.gov','lambda.gsfc.nasa.gov','asd.gsfc.nasa.gov']);
for (const item of manifest.questions) {
  for (const source of item.sources || []) {
    try {
      const url = new URL(source.url);
      if (url.protocol !== 'https:' || !sourceHostAllowlist.has(url.hostname.toLowerCase())) {
        fail(item.id + ': evidence source host is not on the NASA/IAU allowlist');
      }
    } catch {
      fail(item.id + ': invalid evidence source URL');
    }
  }
}
if (!process.exitCode) {
  const pending = coverage['review-needed'] || 0;
  console.log('Question provenance registry OK: ' + seen.size + ' questions covered; ' + pending + ' remain review-needed.');
}

assert.ok(classroom.includes('data-question-review-toggle') &&
          classroom.includes('aria-expanded=') &&
          classroom.includes('pendingQuestions.slice(0, 8)'),
  'the first-screen evidence panel must expose a keyboard-readable, bounded pending-question review queue');
assert.ok(classroom.includes('answerText(question)') &&
          classroom.includes('question.explanation') &&
          classroom.includes('safeQuestionEvidenceUrl(source.url)'),
  'each review-queue item must show the exact question, answer, explanation and allowlisted source candidates');
assert.ok(classroom.includes('只读审阅视图') &&
          !classroom.includes("status = 'verified'"),
  'the review queue must not auto-approve or mutate question evidence status');

assert.ok(classroom.includes('证据索引暂不可用，无法生成逐题清单') &&
          classroom.includes('所有题目继续按待核验处理'),
  'an unavailable evidence index must not be presented as an empty or approved review queue');
for (const selector of [
  '.classroom-review-queue{', '.classroom-review-queue__toggle',
  '.classroom-review-item summary', '.classroom-review-item__sources'
]) assert.ok(classroomCss.includes(selector),
  'question review queue must have responsive, keyboard-visible styles: ' + selector);
