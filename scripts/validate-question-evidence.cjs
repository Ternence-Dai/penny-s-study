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
if (!process.exitCode) console.log('Question provenance registry OK: ' + seen.size + ' questions covered; unreviewed entries remain explicitly review-needed.');
