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

    // Verify the actual 北斗七星 -> 北极星 dynamic diagram and its playback controls.
    await page.evaluate(() => {
      window.state.level = '小学';
      window.state.learnCategory = '星座';
      window.state.page = 'learnDetail';
      window.render();
    });
    const starCanvas = page.locator('.sim-box[data-simid="starMap"] canvas.sim-canvas');
    await starCanvas.waitFor({ state: 'visible', timeout: 10000 });
    const starCanvasId = await starCanvas.getAttribute('id');
    await page.waitForFunction(id => {
      const canvas = document.getElementById(id);
      const instance = window.SimEngine && window.SimEngine.active[id];
      return !!canvas && canvas.width > 0 && canvas.height > 0 &&
        !!instance && instance.playing && instance.t > 0.15;
    }, starCanvasId, { timeout: 10000 });
    const starDescription = await page.locator('.sim-box[data-simid="starMap"] .dyn-caption').innerText();
    if (!starDescription.includes('北斗七星') || !starDescription.includes('北极星') ||
        await starCanvas.evaluate(el => el.getContext('2d').getImageData(0, 0, el.width, el.height).data.some((v, i) => i % 4 === 3 && v > 0)) === false) {
      throw new Error('Star-map simulator did not render its labelled constellation and star field');
    }
    const frameBefore = await starCanvas.evaluate(el => el.toDataURL());
    await page.waitForTimeout(280);
    const frameAfter = await starCanvas.evaluate(el => el.toDataURL());
    if (frameBefore === frameAfter) {
      throw new Error('Star-map animation did not change rendered frames over time');
    }
    await page.locator('.sim-box[data-simid="starMap"] .sim-play').click();
    const pausedAt = await page.evaluate(id => window.SimEngine.active[id].t, starCanvasId);
    await page.waitForTimeout(300);
    const stillPausedAt = await page.evaluate(id => window.SimEngine.active[id].t, starCanvasId);
    if (Math.abs(stillPausedAt - pausedAt) > 0.001) {
      throw new Error('Star-map playback did not pause its simulation clock');
    }
    const speedSlider = page.locator('.sim-box[data-simid="starMap"] .sim-speed');
    await speedSlider.evaluate(el => {
      el.value = '1.8';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const speedState = await page.evaluate(id => ({
      speed: window.SimEngine.active[id].speed,
      label: document.querySelector('.sim-box[data-simid="starMap"] .sim-sp-val')?.textContent
    }), starCanvasId);
    if (speedState.speed !== 1.8 || speedState.label !== '1.8x') {
      throw new Error('Star-map speed control failed to update the simulation rate and visible label');
    }
    await page.locator('.sim-box[data-simid="starMap"] .sim-reset').click();
    const resetClock = await page.evaluate(id => window.SimEngine.active[id].t, starCanvasId);
    if (resetClock !== 0) throw new Error('Star-map reset did not return the simulation clock to zero');
    await page.locator('.sim-box[data-simid="starMap"] .sim-play').click();
    await page.waitForFunction(id => window.SimEngine.active[id].t > 0.05, starCanvasId, { timeout: 3000 });
    await page.evaluate(() => {
      window.SimEngine.stopAll();
      window.state.page = 'home';
      window.render();
    });

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
    console.log('PWA browser acceptance passed: animated star map rendered changing frames, pause/resume, reset and speed controls passed; question provenance disclosure, service worker/app-shell precache, offline root and deep-link recovery, local progress preservation and mobile navigation passed.');
  } finally {
    await context.setOffline(false);
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
