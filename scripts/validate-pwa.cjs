'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
const worker = fs.readFileSync('service-worker.js', 'utf8');
const requiredAssets = [
  './index.html',
  './manifest.webmanifest',
  './assets/icons/app-icon.svg',
  './assets/css/legacy-app.css',
  './assets/css/product-system.css?v=20261019-v6',
  './assets/js/question-bank.js',
  './assets/js/question-grading.js',
  './assets/js/legacy-app.js'
];

assert.ok(html.includes('rel="manifest" href="./manifest.webmanifest"'),
  'index must link the PWA manifest');
assert.ok(html.includes('href="./assets/icons/app-icon.svg"'),
  'index must expose an application icon');
assert.ok(html.includes("navigator.serviceWorker.register('./service-worker.js')"),
  'index must register the service worker on secure origins');
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
assert.equal(manifest.display, 'standalone');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.some(icon =>
  icon.src === './assets/icons/app-icon.svg' && icon.type === 'image/svg+xml'),
  'manifest must declare the local SVG application icon');
for (const asset of requiredAssets) {
  assert.ok(worker.includes("'" + asset + "'"),
    'offline app shell must cache ' + asset);
}
assert.ok(worker.includes('request.method !== \'GET\''),
  'service worker must not intercept mutations');
assert.ok(worker.includes('url.origin !== self.location.origin'),
  'service worker must not intercept third-party requests');
assert.ok(worker.includes("request.mode === 'navigate'") &&
          worker.includes("caches.match('./index.html')"),
  'offline navigation must fall back to the cached application shell');
assert.ok(worker.includes('penny-study-shell-') && worker.includes('self.clients.claim()'),
  'service worker must clean prior cache versions and claim clients');

const icon = fs.readFileSync('assets/icons/app-icon.svg', 'utf8');
assert.ok(icon.includes('<svg') && icon.includes('viewBox="0 0 512 512"'),
  'application icon must be a valid square SVG asset');

console.log('StarStudy PWA manifest, offline shell and static asset checks passed.');
