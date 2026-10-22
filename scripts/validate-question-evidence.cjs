const fs = require('node:fs');
const bankSource = fs.readFileSync('assets/js/question-bank.js', 'utf8');
const manifest = JSON.parse(fs.readFileSync('assets/data/question-evidence.json', 'utf8'));
const rows = bankSource.split(/\r?\n/).map(line => line.match(/^\s*\['([a-z]\d{3})'/)).filter(Boolean).map(match => match[1]);
const fail = message => { console.error(message); process.exitCode = 1; };
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
  if (item.status === 'verified') {
    if (!item.sources.length) fail(item.id + ': verified questions require at least one source');
    if (typeof item.reviewer !== 'string' || !item.reviewer.trim()) fail(item.id + ': verified questions require a reviewer');
    if (typeof item.reviewedAt !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(item.reviewedAt) || !Number.isFinite(Date.parse(item.reviewedAt))) fail(item.id + ': verified questions require a timezone-qualified review timestamp');
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
  if (!item || item.status !== 'review-needed' || item.reviewedAt !== null || item.reviewer !== null) {
    fail(id + ': AI-collected sources must not be promoted to human-verified');
    continue;
  }
  if (!item.sources.length) fail(id + ': expected at least one authoritative source candidate');
  if (!/尚未完成人工/.test(item.reviewNote || '')) fail(id + ': must explicitly retain human-review disclaimer');
}
const sourceHostAllowlist = new Set(['science.nasa.gov','nasa.gov','www.nasa.gov','iau.org','www.iau.org']);
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
if (!process.exitCode) console.log('Question provenance registry OK: ' + seen.size + ' questions covered; unreviewed entries remain explicitly review-needed.');
