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
    const workerResponse = await page.request.get('http://127.0.0.1:4173/service-worker.js');
    const workerSource = await workerResponse.text();
    if (!workerResponse.ok() || !workerSource.includes("penny-study-shell-v19") ||
        !workerSource.includes("observatory-learning-console-v2.css?v=20261022-command-center-v5") ||
        !workerSource.includes("astronomy-classroom-v3.css?v=20261022-classroom-v4-evidence-v1") ||
        !workerSource.includes("astronomy-classroom-v3.js?v=20261022-classroom-v4-evidence-v1") ||
        workerSource.includes("product-system-v9.css")) {
      throw new Error('PWA shell does not version and precache the new astronomy classroom interface');
    }

    const referenceStylesheet = page.locator('link[rel="stylesheet"][href*="reference-platform-v4.css"]');
    if (await referenceStylesheet.count() !== 1) throw new Error('Observatory learning console stylesheet is not linked');
    const referenceCssResponse = await page.request.get(await referenceStylesheet.evaluate(node => node.href));
    const referenceCssText = await referenceCssResponse.text();
    const observatoryLayout = await page.locator('.app').evaluate(node => ({
      display: getComputedStyle(node).display,
      columns: getComputedStyle(node).gridTemplateColumns
    }));
    if (!referenceCssResponse.ok() || !referenceCssText.includes('grid-template-columns:238px minmax(0,1fr)') ||
        observatoryLayout.display !== 'grid' || !observatoryLayout.columns.startsWith('238px')) {
      throw new Error('Reference observatory layout was not loaded/applied: ' + JSON.stringify(observatoryLayout));
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    const wideStudy = await page.evaluate(() => {
      const app = document.querySelector('.app');
      const navbar = document.querySelector('.navbar');
      const tabs = document.querySelector('#tabbar');
      const view = document.querySelector('#view');
      const rect = node => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width, top: box.top, bottom: box.bottom };
      };
      return {
        viewport: innerWidth,
        app: rect(app), navbar: rect(navbar), tabs: rect(tabs), view: rect(view),
        columns: getComputedStyle(app).gridTemplateColumns
      };
    });
    if (wideStudy.app.width < wideStudy.viewport * 0.94 ||
        Math.abs(wideStudy.tabs.left - wideStudy.app.left) > 2 ||
        wideStudy.tabs.width < 220 ||
        wideStudy.tabs.right > wideStudy.view.left + 2 ||
        wideStudy.tabs.left < wideStudy.app.left - 1) {
      throw new Error('Study navigation is not in its dedicated left grid column or overlaps the learning view: ' + JSON.stringify(wideStudy));
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    const desktopShell = await page.evaluate(() => {
      const rect = selector => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, width: box.width, height: box.height };
      };
      return {
        viewport: innerWidth,
        app: rect('.app'), navbar: rect('.navbar'), tabs: rect('#tabbar'),
        hero: rect('#view .classroom-hero'), workflow: rect('#view .classroom-module-section'), view: rect('#view'),
        areas: getComputedStyle(document.querySelector('.app')).gridTemplateAreas
      };
    });
    if (!desktopShell.app || desktopShell.app.width < desktopShell.viewport * .94 ||
        !desktopShell.areas.includes('"tabs view"') ||
        Math.abs(desktopShell.tabs.left - desktopShell.app.left) > 2 ||
        desktopShell.tabs.width < 220 ||
        desktopShell.tabs.right > desktopShell.view.left + 2 ||
        desktopShell.hero.left < desktopShell.tabs.right - 1 ||
        desktopShell.workflow.left < desktopShell.tabs.right - 1) {
      throw new Error('Observatory desktop shell grid places navigation over learning content: ' + JSON.stringify(desktopShell));
    }
    if (desktopShell.tabs.top > 2 || desktopShell.tabs.height < 900 ||
        desktopShell.view.width < desktopShell.viewport * .72 ||
        document.documentElement.scrollWidth > desktopShell.viewport + 2) {
      throw new Error('Observatory left rail or learning canvas is constrained by a mobile/centered navigation rule: ' +
        JSON.stringify(desktopShell));
    }
    const duplicateProductChrome = await page.evaluate(() => ({
      visibleStudyIntro: [...document.querySelectorAll('.study-intro')].some(node =>
        node.getClientRects().length && getComputedStyle(node).display !== 'none'),
      visibleGenericWorkflow: [...document.querySelectorAll('.product-workflow')].some(node =>
        node.getClientRects().length && getComputedStyle(node).display !== 'none')
    }));
    if (duplicateProductChrome.visibleStudyIntro || duplicateProductChrome.visibleGenericWorkflow) {
      throw new Error('The classroom must not show the legacy duplicate hero/workflow chrome: ' +
        JSON.stringify(duplicateProductChrome));
    }

    await page.waitForSelector('.astronomy-classroom');
    const classroom = await page.locator('.astronomy-classroom').count();
    if (classroom !== 1 || !(await page.locator('.classroom-module-grid').count())) {
      throw new Error('Astronomy reference classroom is not mounted as the home workspace');
    }

    const skipLink = page.locator('a.skip-link[href="#view"]');
    if (await skipLink.count() !== 1) throw new Error('Keyboard skip-navigation link is missing');
    await page.keyboard.press('Tab');
    const firstKeyboardTarget = await page.evaluate(() => document.activeElement?.classList.contains('skip-link'));
    if (!firstKeyboardTarget) throw new Error('Skip navigation is not the first keyboard focus target');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.getAttribute('id') === 'view');
    await page.waitForFunction(() => document.querySelector('#tabbar [data-tab="learn"]'));
    const studyHome = await page.evaluate(() => {
      const heading = document.querySelector('#view .w9-home-heading');
      const command = document.querySelector('#view .w9-study-command');
      const tabs = document.querySelector('#tabbar');
      const view = document.querySelector('#view');
      const tab = tabs?.getBoundingClientRect();
      const main = view?.getBoundingClientRect();
      return {
        heading: !!heading, command: !!command,
        tabbarOutsideLearningView: !!tab && !!main && tab.right <= main.left + 2,
        activeTab: document.querySelector('#tabbar button.active')?.dataset.tab || ''
      };
    });
    if (!studyHome.heading || !studyHome.command || !studyHome.tabbarOutsideLearningView || studyHome.activeTab !== 'home') {
      throw new Error('Study homepage is not a dedicated observatory command center: ' + JSON.stringify(studyHome));
    }

    // Verify the study command center reads the same local question and interval-review ledgers as the rest of the app.
    const commandFixture = await page.evaluate(() => {
      const levelQuestions = window.Q.filter(question => question.level === window.state.level);
      const chosen = [];
      const seenCategories = new Set();
      for (const question of levelQuestions) {
        if (chosen.length >= 3) break;
        if (!seenCategories.has(question.category)) {
          chosen.push(question);
          seenCategories.add(question.category);
        }
      }
      if (chosen.length < 3) throw new Error('Insufficient distinct learning categories for command-center fixture');
      const now = Date.now();
      const stats = {};
      chosen.forEach((question,index) => {
        stats[question.id] = { t: 5, c: index === 0 ? 1 : 4, last: now };
      });
      const wrong = chosen.map((question,index) => ({
        id: question.id, count: 1, lastTime: now - index * 1000,
        intervalDays: 1, nextReviewAt: index < 2 ? now - 1000 : now + 86400000,
        correctStreak: 0, lastReviewAt: now - 86400000, lastOutcome: 'incorrect'
      }));
      localStorage.setItem('a_q_v6', JSON.stringify(stats));
      localStorage.setItem('a_w_v6', JSON.stringify(wrong));
      window.render();
      return {
        level: window.state.level,
        weakCategory: chosen[0].category,
        dueCount: 2
      };
    });

    await page.waitForSelector('#view .astronomy-classroom');
    await page.waitForFunction(() => {
      const summary = window.getQuestionEvidenceSummary?.();
      return summary && summary.loadState === 'ready' && !!document.querySelector('.classroom-evidence');
    }, undefined, { timeout: 10000 });
    const evidenceCoverage = await page.evaluate(() => {
      const summary = window.getQuestionEvidenceSummary();
      const panel = document.querySelector('.classroom-evidence');
      return {
        ...summary,
        visible: !!panel,
        visibleText: panel?.innerText || '',
        metrics: panel?.querySelectorAll('.classroom-evidence__metrics article').length || 0
      };
    });
    if (!evidenceCoverage.visible || evidenceCoverage.total !== 300 ||
        evidenceCoverage.verified !== 0 || evidenceCoverage.reviewNeeded !== 300 ||
        evidenceCoverage.withSources !== 21 || evidenceCoverage.withoutSources !== 279 ||
        evidenceCoverage.metrics !== 4 ||
        !evidenceCoverage.visibleText.includes('尚未达到正式题库验收标准')) {
      throw new Error('Question bank source-quality status is not transparently reflected in the classroom: ' +
        JSON.stringify(evidenceCoverage));
    }
    const classroom = await page.evaluate(() => {
      const root = document.querySelector('#view .astronomy-classroom');
      return {
        present: !!root,
        metrics: root?.querySelectorAll('.classroom-metric').length || 0,
        modules: root?.querySelectorAll('.classroom-module').length || 0,
        localStats: root?.querySelector('.classroom-progress-grid')?.innerText || '',
        originalLearningFlow: !!root?.querySelector('.w9-study-command'),
        originalQuestionMap: !!root?.querySelector('.map-grid')
      };
    });
    if (!classroom.present || classroom.metrics !== 4 || classroom.modules !== 6 ||
        !classroom.originalLearningFlow || !classroom.originalQuestionMap) {
      throw new Error('Astronomy classroom command center or retained learning system failed: ' + JSON.stringify(classroom));
    }
    await page.waitForSelector('#view .w9-study-command');
    const commandMetrics = await page.evaluate(() => {
      const panel = document.querySelector('#view .w9-study-command');
      const value = key => Number(panel?.querySelector('[data-learning-metric="' + key + '"]')?.dataset.value);
      return {
        due: value('due-review'),
        weak: value('weak-topics'),
        started: value('topic-coverage'),
        dueButtonDisabled: !!panel?.querySelector('.w9-study-command__review button')?.disabled,
        weakTopicCount: panel?.querySelectorAll('[data-weak-topic]').length || 0,
        level: panel?.dataset.level || ''
      };
    });
    if (commandMetrics.due !== 2 || commandMetrics.weak < 1 ||
        commandMetrics.started !== 3 || commandMetrics.dueButtonDisabled ||
        commandMetrics.weakTopicCount < 1 || commandMetrics.level !== commandFixture.level) {
      throw new Error('Study command-center metrics did not reflect isolated learning records: ' +
        JSON.stringify({ fixture: commandFixture, metrics: commandMetrics }));
    }
    await page.locator('#view .w9-study-command__review button').click();
    await page.waitForFunction(() => window.state.page === 'practice' &&
      window.state.practice?.label === '到期错题间隔复习' &&
      window.state.practice.list.length === 2);
    await page.evaluate(() => {
      window.Store.clearActivePractice();
      window.state.practice = null;
      window.state.page = 'home';
      window.render();
    });
    await page.waitForSelector('#view .w9-study-command');
    const focusButton = page.locator('#view .w9-study-command__topic button').first();
    await focusButton.click();
    await page.waitForFunction(expectedCategory => window.state.page === 'practice' &&
      window.state.practice?.label === expectedCategory, commandFixture.weakCategory);
    await page.evaluate(() => {
      window.Store.clearActivePractice();
      window.state.practice = null;
      window.state.page = 'home';
      window.render();
      localStorage.removeItem('a_q_v6');
      localStorage.removeItem('a_w_v6');
      window.render();
    });

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

    // Exercise the complete practice path with a deterministic two-question fixture.
    // All records live in this isolated Playwright browser context.
    page.on('dialog', dialog => dialog.accept());
    const questionBank = await page.evaluate(async () => {
      await window.questionEvidenceReady;
      return {
        total: window.Q.length,
        elementary: window.Q.filter(question => question.level === '小学').length
      };
    });
    if (questionBank.total !== 300 || questionBank.elementary < 100) {
      throw new Error('Penny question catalogue did not expose the expected 300-question bank: ' + JSON.stringify(questionBank));
    }
    await page.evaluate(() => {
      const list = ['p001', 'p002'].map(id => window.Q.find(question => question.id === id));
      if (list.some(question => !question)) throw new Error('Practice fixture questions are missing from the bank');
      window.state.practice = {
        list, index: 0, userAnswers: [null, null], evaluated: [false, false],
        correct: 0, wrong: 0, showAnswer: false, submitting: false,
        level: '小学', label: '浏览器练习恢复验收'
      };
      if (!window.Store.saveActivePractice(window.state.practice)) {
        throw new Error('Could not persist deterministic practice fixture');
      }
      window.state.page = 'practice';
      window.render();
    });
    if (!(await page.locator('#view .stem').innerText()).includes('体积最大的行星')) {
      throw new Error('Deterministic practice fixture did not render its first question');
    }
    await page.locator('#view .option').nth(0).click(); // p001: deliberately incorrect (Earth, not Jupiter)
    await page.locator('#view .w5-practice-actions .btn-main').click();
    await page.waitForSelector('#view .explain .head.no', { timeout: 10000 });
    await page.waitForFunction(() => {
      const wrong = JSON.parse(localStorage.getItem('a_w_v6') || '[]');
      const session = JSON.parse(localStorage.getItem('a_active_practice_v1') || 'null');
      return wrong.some(item => item.id === 'p001' && item.count === 1 &&
          item.lastOutcome === 'incorrect' && item.intervalDays === 1) &&
        session && session.wrong === 1 && session.evaluated[0] === true;
    }, undefined, { timeout: 10000 });
    const firstPracticeSnapshot = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('a_active_practice_v1') || 'null'));
    if (!firstPracticeSnapshot || firstPracticeSnapshot.questionIds.join(',') !== 'p001,p002' ||
        firstPracticeSnapshot.userAnswers[0] !== 0 || firstPracticeSnapshot.index !== 0) {
      throw new Error('Wrong practice answer and resumable session snapshot were not persisted consistently');
    }

    await page.locator('#view .w5-practice-actions .btn-main').click();
    await page.waitForFunction(() => window.state.practice?.index === 1);
    await page.locator('#backBtn').click();
    await page.waitForSelector('#view .w9-practice-resume', { timeout: 10000 });
    const resumeCard = await page.locator('#view .w9-practice-resume').innerText();
    if (!resumeCard.includes('继续上次练习') || !resumeCard.includes('已完成 1 / 2 题')) {
      throw new Error('Home learning dashboard did not summarize the interrupted practice session: ' + resumeCard);
    }

    // A full page reload must preserve the exact question IDs, index, answer and score.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#view .w9-practice-resume', { timeout: 10000 });
    await page.locator('#view .w9-practice-resume__actions .btn-main').click();
    await page.waitForFunction(() => window.state.page === 'practice' && window.state.practice?.index === 1);
    if (!(await page.locator('#view .stem').innerText()).includes('距离太阳最近的行星')) {
      throw new Error('Resumed practice did not restore the second question at its saved position');
    }
    const restoredScore = (await page.locator('#view .w5-practice-score').innerText()).replace(/\s+/g, ' ').trim();
    if (!restoredScore.includes('1 答错') || !restoredScore.includes('0 答对')) {
      throw new Error('Resumed practice did not restore its answered/wrong counters: ' + restoredScore);
    }
    await page.locator('#view .w5-practice-actions .btn-ghost').first().click();
    await page.waitForSelector('#view .explain .head.no');
    if (!(await page.locator('#view').innerText()).includes('已判分 · 不重复计分')) {
      throw new Error('Previously evaluated question did not restore its locked grading state');
    }
    const savedStatsBeforeRepeat = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('a_q_v6') || '{}').p001?.t || 0);
    await page.keyboard.press('Enter'); // Enter advances after review; it must not grade the same answer twice.
    await page.waitForFunction(() => window.state.practice?.index === 1);
    const savedStatsAfterRepeat = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('a_q_v6') || '{}').p001?.t || 0);
    if (savedStatsBeforeRepeat !== 1 || savedStatsAfterRepeat !== 1) {
      throw new Error('Revisiting an already graded practice answer changed its question statistics');
    }

    // Complete question two correctly and verify the review queue and focused retry entry point.
    await page.locator('#view .option').nth(0).click(); // p002: Mercury is correct.
    await page.locator('#view .w5-practice-actions .btn-main').click();
    await page.waitForSelector('#view .explain .head.ok', { timeout: 10000 });
    await page.waitForFunction(() => {
      const session = JSON.parse(localStorage.getItem('a_active_practice_v1') || 'null');
      return session && session.correct === 1 && session.wrong === 1 &&
        session.evaluated.every(Boolean);
    });
    await page.locator('#backBtn').click();
    await page.locator('#tabbar [data-tab="wrong"]').click();
    await page.waitForSelector('#view .group-head', { timeout: 10000 });
    const wrongSummary = await page.locator('#view .sub').first().innerText();
    if (!wrongSummary.includes('1 道待掌握题')) {
      throw new Error('Wrong-answer ledger did not aggregate the single incorrect fixture: ' + wrongSummary);
    }
    await page.locator('#view .group-head').first().click();
    const wrongCard = (await page.locator('#view .group-body .card').first().innerText()).replace(/\s+/g, ' ').trim();
    if (!wrongCard.includes('体积最大的行星') || !wrongCard.includes('错 1 次') ||
        !wrongCard.includes('连续答对 0 / 3')) {
      throw new Error('Wrong-book review card did not preserve question identity and spaced-review state: ' + wrongCard);
    }
    await page.locator('#view .group-body .btn-amber').click();
    await page.waitForFunction(() => window.state.page === 'practice' &&
      window.state.practice?.list.some(question => question.id === 'p001'));
    await page.evaluate(() => {
      window.Store.clearActivePractice();
      window.Store.clearWrong();
      window.state.practice = null;
      window.state.page = 'home';
      window.render();
    });

    // Exercise timed-exam navigation, answer-card review, scoring and result rendering.
    await page.evaluate(() => {
      const list = ['p001', 'p002'].map(id => window.Q.find(question => question.id === id));
      window.state.exam = {
        list, index: 0, answers: [null, null], remain: 120, total: 120,
        showCard: false, running: false
      };
      window.state.page = 'exam';
      window.render();
    });
    await page.locator('#view .option').nth(0).click();
    await page.locator('#view .btn-row button').nth(1).click();
    await page.waitForFunction(() => window.state.exam?.index === 1);
    await page.locator('#view .option').nth(0).click();
    await page.locator('#view .topbar .card-btn').click();
    await page.waitForSelector('#view .sheet.show');
    await page.locator('#view .sheet-item').first().click();
    await page.waitForFunction(() => window.state.exam?.index === 0 && !window.state.exam?.showCard);
    await page.locator('#view .btn-main').click();
    await page.waitForSelector('#view .score-card', { timeout: 10000 });
    const examResult = (await page.locator('#view').innerText()).replace(/\s+/g, ' ').trim();
    if (!examResult.includes('本次得分') || !examResult.includes('满分 4 分') ||
        !examResult.includes('50%') || !examResult.includes('1 题')) {
      throw new Error('Competition exam did not produce the expected score and answer breakdown: ' + examResult);
    }
    const examStats = (await page.locator('#view .stat-row').innerText()).replace(/\s+/g, ' ').trim();
    if (!examStats.includes('1') || !examStats.includes('答对') || !examStats.includes('答错')) {
      throw new Error('Competition result summary omitted correct/incorrect counts: ' + examStats);
    }

    // Clear only synthetic fixture records; keep this browser context clean for PWA/offline tests.
    await page.evaluate(() => {
      ['a_w_v6','a_r_v6','a_d_v6','a_q_v6','a_active_practice_v1'].forEach(key => localStorage.removeItem(key));
      window.state.exam = null;
      window.state.result = null;
      window.state.practice = null;
      window.state.page = 'home';
      window.render();
    });
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
        './assets/js/legacy-app.js?v=20261022-question-evidence-dashboard-v2',
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
      heading: document.querySelector('.classroom-hero h2')?.textContent.trim(),
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
      appVisible: !!document.querySelector('.classroom-hero h2'),
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
    const mobileGeometry = await page.evaluate(() => {
      const tabs = document.getElementById('tabbar');
      const rect = tabs.getBoundingClientRect();
      return {
        left: rect.left, right: rect.right, width: rect.width,
        top: rect.top, bottom: rect.bottom,
        position: getComputedStyle(tabs).position,
        direction: getComputedStyle(tabs).flexDirection,
        viewport: innerWidth
      };
    });
    if (mobileGeometry.position !== 'fixed' ||
        mobileGeometry.direction !== 'row' ||
        mobileGeometry.left > 1 ||
        mobileGeometry.right < mobileGeometry.viewport - 1 ||
        mobileGeometry.bottom < 840) {
      throw new Error('Mobile study navigation is not a full-width bottom tab bar: ' + JSON.stringify(mobileGeometry));
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
