'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleMessages = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'warning' || message.type() === 'error') consoleMessages.push(message.text()); });

  try {
    await page.goto('https://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#tabbar [data-tab="learn"]'));
    await page.evaluate(() => {
      localStorage.setItem('penny-offline-acceptance', 'preserved');
    });

    const registration = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable');
      if (!window.isSecureContext || location.protocol !== 'https:') {
        throw new Error('PWA acceptance page is not a secure HTTPS context');
      }
      const registration = await navigator.serviceWorker.register('./service-worker.js');
      return {
        scope: registration.scope,
        active: registration.active && registration.active.state,
        installing: registration.installing && registration.installing.state,
        waiting: registration.waiting && registration.waiting.state
      };
    });
    await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return !!(registration && registration.active && registration.active.state === 'activated');
    }, undefined, { timeout: 20000 });
    if (!registration.active || !registration.scope.endsWith('/')) {
      throw new Error('Service worker did not activate with an app-root scope: ' + JSON.stringify(registration) + '; console: ' + consoleMessages.join(' | '));
    }

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 15000 });
    const cacheReport = await page.evaluate(async () => {
      const keys = await caches.keys();
      const shellName = keys.find(key => key.startsWith('penny-study-shell-'));
      if (!shellName) return { keys, shellName: null, assets: [] };
      const cache = await caches.open(shellName);
      const required = [
        './index.html',
        './manifest.webmanifest',
        './assets/css/legacy-app.css',
        './assets/css/reference-interface-v1.css?v=20261021-reference-ui-v1',
        './assets/js/question-bank.js',
        './assets/js/legacy-app.js?v=20261020-study-motion-accessibility-v6',
        './assets/js/workspace-v5.js?v=20261019-v52'
      ];
      const assets = await Promise.all(required.map(async path => ({
        path,
        cached: !!(await cache.match(new URL(path, location.href).href))
      })));
      return { keys, shellName, assets };
    });
    if (!cacheReport.shellName || cacheReport.assets.some(asset => !asset.cached)) {
      throw new Error('Incomplete offline app shell: ' + JSON.stringify(cacheReport));
    }

    await context.setOffline(true);
    await page.goto('https://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('#tabbar [data-tab="learn"]'));
    const offlineRoot = await page.evaluate(() => ({
      title: document.title,
      heading: document.querySelector('.study-intro h2')?.textContent.trim(),
      preserved: localStorage.getItem('penny-offline-acceptance')
    }));
    if (!offlineRoot.heading || offlineRoot.preserved !== 'preserved') {
      throw new Error('Offline root launch or local progress preservation failed: ' + JSON.stringify(offlineRoot));
    }

    const deepUrl = 'https://127.0.0.1:4173/learning/astronomy/contest?source=offline-smoke';
    await page.goto(deepUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('#tabbar [data-tab="learn"]'));
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    const deepRecovery = await page.evaluate(() => ({
      url: location.pathname + location.search,
      title: document.title,
      appVisible: !!document.querySelector('.study-intro h2'),
      learnTabVisible: !!document.querySelector('#tabbar [data-tab="learn"]'),
      preserved: localStorage.getItem('penny-offline-acceptance')
    }));
    if (!deepRecovery.appVisible || !deepRecovery.learnTabVisible ||
        deepRecovery.preserved !== 'preserved' ||
        !deepRecovery.url.includes('/learning/astronomy/contest')) {
      throw new Error('Offline deep-link recovery failed: ' + JSON.stringify(deepRecovery));
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => {
      const tabbar = document.querySelector('#tabbar');
      return {
        viewport: window.innerWidth,
        tabbarVisible: !!tabbar && getComputedStyle(tabbar).display !== 'none' &&
          tabbar.getBoundingClientRect().width >= 300,
        learnTab: !!document.querySelector('#tabbar [data-tab="learn"]')
      };
    });
    if (!mobile.tabbarVisible || !mobile.learnTab) {
      throw new Error('Mobile offline navigation failed: ' + JSON.stringify(mobile));
    }
    if (pageErrors.length) throw new Error('Browser runtime errors: ' + pageErrors.join(' | ') + '; console: ' + consoleMessages.join(' | '));
    console.log('PWA browser acceptance passed: service worker activated, app shell assets precached, offline root launch and refresh passed, offline deep-link recovery and local progress preservation passed, mobile navigation passed.');
  } finally {
    await context.setOffline(false);
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
