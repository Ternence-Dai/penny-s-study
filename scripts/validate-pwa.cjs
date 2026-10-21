'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
const worker = fs.readFileSync('service-worker.js', 'utf8');
assert.doesNotThrow(() => new vm.Script(worker, { filename: 'service-worker.js' }),
  'service worker must parse before the browser attempts registration');
const requiredAssets = [
  './index.html',
  './manifest.webmanifest',
  './assets/icons/app-icon.svg',
  './assets/css/legacy-app.css',
  './assets/css/product-system.css?v=20261019-v8',
  './assets/css/workspace-v5.css?v=20261019-v5',
  './assets/css/product-system-v9.css?v=20261019-v92',
  './assets/css/practice-session-v9.css?v=20261019-v9',
  './assets/css/study-command-center.css?v=20261020-v2',
  './assets/css/reference-interface-v1.css?v=20261021-reference-ui-v1',
  './assets/css/readability-accessibility-v10.css?v=20261021-v10',
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
  if (asset.startsWith('./assets/')) {
    const assetPath = asset.split('?')[0];
    assert.ok(html.includes(assetPath),
      'offline app shell entry must correspond to an asset referenced by the page: ' + assetPath);
  }
}
assert.ok(worker.includes('request.method !== \'GET\''),
  'service worker must not intercept mutations');
assert.ok(worker.includes('const isStaticAsset') && worker.includes('if (!isStaticAsset) return;'),
  'runtime caching must be allowlisted to public static assets, not arbitrary same-origin responses');
assert.ok(worker.includes('url.origin !== self.location.origin'),
  'service worker must not intercept third-party requests');
assert.ok(worker.includes("request.mode === 'navigate'") &&
          worker.includes("const isAppShellNavigation") &&
          worker.includes("url.pathname === appRootUrl.pathname") &&
          worker.includes("caches.match(appShellUrl)"),
  'offline navigation must use the cached app shell without allowing deep links to overwrite it');
assert.ok(worker.includes('penny-study-shell-') && worker.includes('self.clients.claim()'),
  'service worker must clean prior cache versions and claim clients');
const icon = fs.readFileSync('assets/icons/app-icon.svg', 'utf8');
assert.ok(icon.includes('<svg') && icon.includes('viewBox="0 0 512 512"'),
  'application icon must be a valid square SVG asset');
assert.ok(worker.includes('if (url.search) return;'),
  'runtime cache must skip query variants to prevent unbounded cache-key growth');
console.log('StarStudy PWA manifest, offline shell and static asset checks passed.');
