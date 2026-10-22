'use strict';

const CACHE_NAME = 'penny-study-shell-v8';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icons/app-icon.svg',
  './assets/css/legacy-app.css',
  './assets/css/product-system.css?v=20261019-v8',
  './assets/css/workspace-v5.css?v=20261019-v5',
  './assets/css/product-system-v9.css?v=20261019-v92',
  './assets/css/practice-session-v9.css?v=20261019-v9',
  './assets/css/study-command-center.css?v=20261020-v2',
  './assets/css/reference-interface-v1.css?v=20261022-evidence-sources-v1',
  './assets/css/readability-accessibility-v10.css?v=20261021-v10',
  './assets/js/question-bank.js',
  './assets/data/question-evidence.json?v=20261022-evidence-index-v1',
  './assets/js/question-grading.js',
  './assets/js/legacy-app.js?v=20261022-question-evidence-source-ui-v1',
  './assets/js/workspace-v5.js?v=20261019-v52',
  './assets/js/workspace-v5-context.js?v=20261021-mutationobserver-fix-v1'
];
const PRECACHED_URLS = new Set(APP_SHELL.map(asset => new URL(asset, self.location.href).href));

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('penny-study-shell-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    const appRootUrl = new URL('./', self.registration.scope);
    const appShellUrl = new URL('./index.html', self.registration.scope);
    const isAppShellNavigation =
      url.pathname === appRootUrl.pathname || url.pathname === appShellUrl.pathname;
    event.respondWith(
      fetch(request).then(response => {
        if (isAppShellNavigation && response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          return caches.open(CACHE_NAME)
            .then(cache => cache.put(appShellUrl, copy).catch(() => {}))
            .then(() => response);
        }
        return response;
      }).catch(() => caches.match(appShellUrl).then(cached => {
        if (!cached) return cached;
        const headers = new Headers(cached.headers);
        headers.delete('content-length');
        return cached.text().then(html => {
          const baseTag = '<base href="' + appRootUrl.href + '">';
          const body = html.replace(/<head(\s[^>]*)?>/i, match => match + baseTag);
          return new Response(body, { status: 200, headers });
        });
      }))
    );
    return;
  }

  // Do not cache arbitrary same-origin GETs such as API or user-data responses.
  const isAssetDirectory = ['/assets/css/', '/assets/js/', '/assets/icons/', '/assets/data/']
    .some(prefix => url.pathname.includes(prefix));
  const isAssetExtension = ['.css', '.js', '.svg', '.json']
    .some(extension => url.pathname.endsWith(extension));
  const isStaticAsset = (isAssetDirectory && isAssetExtension) ||
    url.pathname.endsWith('/manifest.webmanifest');
  if (!isStaticAsset) return;
  // Serve versioned assets only when their exact URL belongs to the precached
  // shell; skip arbitrary query variants to keep runtime cache keys bounded.
  if (url.search && !PRECACHED_URLS.has(url.href)) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
