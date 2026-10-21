'use strict';

const CACHE_NAME = 'penny-study-shell-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icons/app-icon.svg',
  './assets/css/legacy-app.css',
  './assets/css/product-system.css?v=20261019-v6',
  './assets/js/question-bank.js',
  './assets/js/question-grading.js',
  './assets/js/legacy-app.js'
];

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
        // Only the app root may refresh the cached shell. A successful deep-link
        // response must never overwrite the offline entry point.
        if (isAppShellNavigation && response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          return caches.open(CACHE_NAME)
            .then(cache => cache.put(appShellUrl, copy).catch(() => {}))
            .then(() => response);
        }
        return response;
      }).catch(() => caches.match(appShellUrl))
    );
    return;
  }

  // Runtime caching is limited to versionable public app assets. Never cache
  // arbitrary same-origin GETs such as API, account, or user-data responses.
  const isStaticAsset =
    /\/assets\/(?:css|js|icons)\/[^/]+\.(?:css|js|svg)$/.test(url.pathname) ||
    url.pathname.endsWith('/manifest.webmanifest');
  if (!isStaticAsset) return;
  // Ignore cache-busting or attacker-controlled query variants so the cache cannot
  // accumulate unbounded entries for the same static asset path.
  if (url.search) return;

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
