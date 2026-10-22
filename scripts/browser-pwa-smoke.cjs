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
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 30000 });
    const skipLink = page.locator('a.skip-link[href="#view"]');
    if (await skipLink.count() !== 1) throw new Error('Keyboard skip-navigation link is missing');
    await page.keyboard.press('Tab');
    const firstKeyboardTarget = await page.evaluate(() => document.activeElement?.classList.contains('skip-link'));
    if (!firstKeyboardTarget) throw new Error('Skip navigation is not the first keyboard focus target');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.getAttribute('id') === 'view');
    const contextScript = await page.locator('script[src*="workspace-v5-context.js"]').getAttribute('src');
    if (!contextScript || !contextScript.includes('v=20261021-mutationobserver-fix-v1')) {
      throw new Error('Workspace observer fix cache-busting URL is missing: ' + contextScript);
    }
    await page.waitForFunction(() => document.querySelector('#tabbar [data-tab="learn"]'));
    await page.evaluate(async () => {
      await window.questionEvidenceReady;
      const question = window.Q.find(item => item.id === 'p001');
      window.state.practice = {
        label: 'Evidence provenance browser regression',
        list: [question], index: 0, userAnswers: [null], evaluated: [false],
        correct: 0, wrong: 0, showAnswer: true, submitting: false
      };
      window.state.page = 'practice';
      window.render();
    });
    await page.waitForSelector('#view .w5-question-evidence');
    const evidenceDisclosure = await page.locator('#view .w5-question-evidence').innerText();
    if (!evidenceDisclosure.includes('待人工终审') ||
        !evidenceDisclosure.includes('尚未完成人工逐题审核') ||
        await page.locator('#view .w5-question-evidence a[href="https://science.nasa.gov/jupiter/jupiter-facts/"]').count() !== 1) {
      throw new Error('Question evidence candidates must be visible with an explicit human-review disclaimer');
    }
    await page.evaluate(() => { window.state.practice = null; window.state.page = 'home'; window.render(); });
    await page.evaluate(() => {
      localStorage.setItem('penny-offline-acceptance', 'preserved');
    });

    const registration = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable');
      if (!window.isSecureContext || !(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
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
        './assets/css/reference-interface-v1.css?v=20261022-evidence-sources-v1',
        './assets/js/question-bank.js',
        './assets/js/legacy-app.js?v=20261022-question-evidence-source-ui-v1',
        './assets/js/workspace-v5-context.js?v=20261021-mutationobserver-fix-v1',
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
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('#tabbar [data-tab="learn"]'));
    const offlineRoot = await page.evaluate(() => ({
      title: document.title,
      heading: document.querySelector('.study-intro h2')?.textContent.trim(),
      preserved: localStorage.getItem('penny-offline-acceptance')
    }));
    if (!offlineRoot.heading || offlineRoot.preserved !== 'preserved') {
      throw new Error('Offline root launch or local progress preservation failed: ' + JSON.stringify(offlineRoot));
    }
    const offlineEvidence = await page.evaluate(async () => {
      await window.questionEvidenceReady;
      window.state.practice = {
        label: 'Offline evidence source regression',
        list: [window.Q.find(item => item.id === 'p001')], index: 0,
        userAnswers: [null], evaluated: [false], correct: 0, wrong: 0,
        showAnswer: true, submitting: false
      };
      window.state.page = 'practice';
      window.render();
      return document.querySelector('#view .w5-question-evidence')?.textContent || '';
    });
    if (!offlineEvidence.includes('待人工终审')) {
      throw new Error('The public evidence index or question-review disclaimer is missing in offline mode');
    }

    const deepUrl = 'http://127.0.0.1:4173/learning/astronomy/contest?source=offline-smoke';
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
