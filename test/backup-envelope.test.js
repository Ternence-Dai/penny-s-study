// Unified backup envelope + age encrypted export (wave 6, item 3 —
// replicated from the Human-Digital-Twin-Health pilot, adapted to
// this repository's multi-dataset storage shape).
//
// Pins: the backup set (the recovery packet's entry set — the KEY
// datasets plus the attempt log; error-events and fsrs-shadow stay
// out, per the registry's own notes), the envelope manifest shape
// (schemaVersion / exportedBy / exportedAt / per-dataset declared
// version + item count from STORAGE_REGISTRY), the exact-gate
// rejections (higher envelope version, manifest version differing
// from the registry declaration, count mismatch, missing, unlisted
// or out-of-set dataset, future practice-session stamp — all
// rejected before any dataset may be restored), recognition of age
// ciphertext, a real encrypt -> decrypt round trip through the
// vendored typage bundle, and the passphrase privacy discipline.
// This repository's recovery model is export-only: no test here (or
// code anywhere) writes enveloped datasets back into storage, and
// the child question pool is untouched by the envelope layer (the
// verify chain re-runs validate-child-pool: 144 / 110).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  BACKUP_ENVELOPE_VERSION,
  BACKUP_ENVELOPE_FORMAT,
  BACKUP_ENVELOPE_EXPORTED_BY,
  BACKUP_DATASETS,
  BACKUP_EXCLUDED_DATASET_IDS,
  buildUnifiedBackupEnvelope,
  isUnifiedBackupEnvelope,
  parseUnifiedBackupEnvelope,
  backupDatasetItemCount,
  looksLikeAgeCiphertext,
  buildErrorEvent
} from '../src/domain/index.js';

const exportedAt = '2026-11-26T00:00:00.000Z';

function fixtureDatasets() {
  return {
    wrong: [{ id: 'q-1' }, { id: 'q-2' }],
    record: [{ id: 'r-1' }],
    days: ['2026-11-20', '2026-11-21'],
    qstats: { 'q-1': { t: 2, c: 1 } },
    ai: [],
    prefs: { level: '小学' },
    graduated: [],
    attempts: [{ id: 'a-1' }],
    practice: { version: 1, questionIds: ['q-1'] }
  };
}

function loadAgeBundle() {
  const source = fs.readFileSync(new URL('../assets/js/vendor/age-encryption.js', import.meta.url), 'utf8');
  vm.runInThisContext(source + '\n;globalThis.__pennyAgeBundleForTest = age;');
  const api = globalThis.__pennyAgeBundleForTest;
  delete globalThis.__pennyAgeBundleForTest;
  return api;
}

test('the backup set is the recovery packet entry set, exclusions pinned', () => {
  assert.deepEqual(BACKUP_DATASETS.map(entry => entry.id), [
    'wrong', 'record', 'days', 'qstats', 'ai', 'prefs', 'graduated', 'attempts', 'practice'
  ]);
  assert.deepEqual([...BACKUP_EXCLUDED_DATASET_IDS], ['error-events', 'fsrs-shadow']);
});

test('envelope carries a manifest with declared versions and counts', () => {
  const envelope = buildUnifiedBackupEnvelope(fixtureDatasets(), exportedAt);
  assert.equal(envelope.format, BACKUP_ENVELOPE_FORMAT);
  assert.equal(envelope.manifest.schemaVersion, BACKUP_ENVELOPE_VERSION);
  assert.equal(envelope.manifest.exportedBy, BACKUP_ENVELOPE_EXPORTED_BY);
  assert.equal(envelope.manifest.exportedAt, exportedAt);
  const byKey = Object.fromEntries(envelope.manifest.datasets.map(entry => [entry.key, entry]));
  assert.equal(byKey.wrong.count, 2);
  assert.equal(byKey.days.count, 2);
  assert.equal(byKey.qstats.count, 1);
  assert.equal(byKey.prefs.count, 1);
  assert.equal(byKey.ai.count, 0);
  assert.equal(byKey.wrong.schemaVersion, 6);
  assert.equal(byKey.attempts.schemaVersion, 1);
  assert.equal(byKey.practice.schemaVersion, 1);
  // The dataset payloads are exactly the stored shapes.
  assert.deepEqual(envelope.datasets, fixtureDatasets());
});

test('absent datasets envelope as null with count 0 and parse back', () => {
  const envelope = buildUnifiedBackupEnvelope({}, exportedAt);
  assert.equal(envelope.datasets.wrong, null);
  assert.equal(envelope.manifest.datasets.find(entry => entry.key === 'wrong').count, 0);
  const restored = parseUnifiedBackupEnvelope(envelope);
  assert.equal(restored.wrong, null);
  assert.deepEqual(Object.keys(restored).sort(), BACKUP_DATASETS.map(entry => entry.id).sort());
});

test('envelope unwraps to the datasets map', () => {
  const envelope = buildUnifiedBackupEnvelope(fixtureDatasets(), exportedAt);
  assert.equal(isUnifiedBackupEnvelope(envelope), true);
  assert.deepEqual(parseUnifiedBackupEnvelope(envelope), fixtureDatasets());
});

test('plain objects and recovery packets are not unified envelopes', () => {
  assert.equal(isUnifiedBackupEnvelope(fixtureDatasets()), false);
  assert.equal(isUnifiedBackupEnvelope(null), false);
  assert.equal(isUnifiedBackupEnvelope([]), false);
  assert.throws(() => parseUnifiedBackupEnvelope({ format: 'penny-s-study-raw-local-storage-recovery' }), TypeError);
});

test('a higher envelope version is rejected explicitly, never guessed at', () => {
  const envelope = buildUnifiedBackupEnvelope(fixtureDatasets(), exportedAt);
  envelope.manifest.schemaVersion = BACKUP_ENVELOPE_VERSION + 1;
  assert.throws(() => parseUnifiedBackupEnvelope(envelope), /备份信封版本不受支持/);
});

test('a manifest version differing from the registry declaration is rejected', () => {
  const envelope = buildUnifiedBackupEnvelope(fixtureDatasets(), exportedAt);
  envelope.manifest.datasets.find(entry => entry.key === 'wrong').schemaVersion = 7;
  assert.throws(() => parseUnifiedBackupEnvelope(envelope), /版本不受支持/);
});

test('a manifest count that does not match the dataset items is rejected', () => {
  const envelope = buildUnifiedBackupEnvelope(fixtureDatasets(), exportedAt);
  envelope.manifest.datasets.find(entry => entry.key === 'days').count = 3;
  assert.throws(() => parseUnifiedBackupEnvelope(envelope), /完整性校验失败/);
});

test('a listed dataset missing from the payload is rejected', () => {
  const envelope = buildUnifiedBackupEnvelope(fixtureDatasets(), exportedAt);
  delete envelope.datasets.days;
  assert.throws(() => parseUnifiedBackupEnvelope(envelope), /缺失/);
});

test('an unlisted dataset present in the payload is rejected', () => {
  const envelope = buildUnifiedBackupEnvelope(fixtureDatasets(), exportedAt);
  envelope.datasets['fsrs-shadow'] = [];
  assert.throws(() => parseUnifiedBackupEnvelope(envelope), /未在清单中列出/);
});

test('a listed dataset outside the backup set is rejected', () => {
  const envelope = buildUnifiedBackupEnvelope(fixtureDatasets(), exportedAt);
  envelope.manifest.datasets.push({ key: 'fsrs-shadow', schemaVersion: 1, storage: 'local-browser', count: 0 });
  envelope.datasets['fsrs-shadow'] = [];
  assert.throws(() => parseUnifiedBackupEnvelope(envelope), /不在备份集内/);
});

test('a future practice-session stamp is rejected on build and on parse', () => {
  const future = fixtureDatasets();
  future.practice = { version: 99, questionIds: [] };
  assert.throws(() => buildUnifiedBackupEnvelope(future, exportedAt), /更高版本/);
  const envelope = buildUnifiedBackupEnvelope(fixtureDatasets(), exportedAt);
  envelope.datasets.practice = { version: 99, questionIds: [] };
  envelope.manifest.datasets.find(entry => entry.key === 'practice').count = 2;
  assert.throws(() => parseUnifiedBackupEnvelope(envelope), /版本不受支持/);
});

test('a scalar dataset payload is rejected by the count probe', () => {
  assert.equal(backupDatasetItemCount('oops'), null);
  assert.equal(backupDatasetItemCount(42), null);
  assert.throws(() => buildUnifiedBackupEnvelope({ wrong: 'oops' }, exportedAt), TypeError);
});

test('age ciphertext is recognized by its header, JSON is not', () => {
  const binary = new TextEncoder().encode('age-encryption.org/v1\n-> scrypt abc\n--- abc');
  const armored = new TextEncoder().encode('-----BEGIN AGE ENCRYPTED FILE-----\nabc');
  const json = new TextEncoder().encode('{"format":"penny-backup-envelope"}');
  assert.equal(looksLikeAgeCiphertext(binary), true);
  assert.equal(looksLikeAgeCiphertext(armored), true);
  assert.equal(looksLikeAgeCiphertext(json), false);
  assert.equal(looksLikeAgeCiphertext(new Uint8Array(0)), false);
  assert.equal(looksLikeAgeCiphertext(null), false);
});

test('vendored age bundle round-trips the serialized envelope', async () => {
  const age = loadAgeBundle();
  const passphrase = 'correct horse battery staple';
  const envelope = buildUnifiedBackupEnvelope(fixtureDatasets(), exportedAt);
  const serialized = JSON.stringify(envelope);
  const encrypter = new age.Encrypter();
  encrypter.setPassphrase(passphrase);
  const ciphertext = await encrypter.encrypt(serialized);
  assert.equal(looksLikeAgeCiphertext(ciphertext), true);
  const decrypter = new age.Decrypter();
  decrypter.addPassphrase(passphrase);
  const decrypted = await decrypter.decrypt(ciphertext, 'text');
  assert.equal(decrypted, serialized);
  assert.deepEqual(parseUnifiedBackupEnvelope(JSON.parse(decrypted)), fixtureDatasets());
});

test('a wrong passphrase cannot decrypt the envelope', async () => {
  const age = loadAgeBundle();
  const encrypter = new age.Encrypter();
  encrypter.setPassphrase('the-right-passphrase');
  const ciphertext = await encrypter.encrypt(JSON.stringify(buildUnifiedBackupEnvelope(fixtureDatasets(), exportedAt)));
  const decrypter = new age.Decrypter();
  decrypter.addPassphrase('the-wrong-passphrase');
  await assert.rejects(() => decrypter.decrypt(ciphertext, 'text'));
});

test('the passphrase never enters the envelope or an error event', () => {
  const passphrase = 'super-secret-passphrase-123';
  const envelope = buildUnifiedBackupEnvelope(fixtureDatasets(), exportedAt);
  assert.equal(JSON.stringify(envelope).includes(passphrase), false);
  const event = buildErrorEvent(
    { kind: 'export_failed', context: { stage: 'encrypted-export' } },
    exportedAt
  );
  assert.equal(JSON.stringify(event).includes(passphrase), false);
});

test('UI source never routes the passphrase to storage or error events', () => {
  const uiSource = fs.readFileSync(new URL('../assets/js/legacy-app.js', import.meta.url), 'utf8');
  assert.equal(/recordErrorEvent\([^)]*passphrase/.test(uiSource), false);
  assert.equal(/localStorage\.setItem\([^)]*passphrase/.test(uiSource), false);
  assert.ok(uiSource.includes('buildUnifiedBackupEnvelope'));
  assert.ok(uiSource.includes('assets/js/vendor/age-encryption.js'));
  // Export-only discipline: the UI gains no backup import path.
  assert.equal(uiSource.includes('parseUnifiedBackupEnvelope('), false);
});

test('the vendored age bundle is not in the service-worker precache', () => {
  const swSource = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.equal(swSource.includes('age-encryption'), false);
});
