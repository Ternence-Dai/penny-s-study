// Browser smoke tests for the StarStudy astronomy learning centre
// (Playwright).
//
// This brings the first-screen coverage of scripts/browser-pwa-smoke.cjs
// into the `node --test` suite in a compact form: serve the repository
// root over a local HTTP server, open the first screen in Chromium, and
// assert that the learning command centre shell and its read-only
// question-bank evidence panel render with no uncaught page errors and
// no console errors. The deeper flows of the original script (classroom,
// NASA data loading, practice sessions) stay with that script; in
// particular this smoke never starts a practice session and never
// triggers the NASA TAP read.
//
// Hermetic by construction: requests to any origin other than the local
// test server are fulfilled with an empty body, so the run never
// depends on external CDNs or data services.
// Read-only guard: any non-GET request to the local origin fails the
// test, so the smoke can never write attempt logs or mutate the local
// learning records the app keeps in browser storage.
//
// Setup (one time):
//   npm install --no-save --package-lock=false playwright
//   npx playwright install --only-shell chromium
//
// When Playwright or its Chromium build is unavailable every test skips,
// so a plain `npm test` (domain suite) stays green on machines without a
// browser.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

let playwright = null;
try {
  playwright = await import('playwright');
} catch {
  playwright = null;
}

let server;
let baseUrl;
let browser;
let browserUnavailableReason = null;

before(async () => {
  server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
      const filePath = normalize(join(ROOT, decodeURIComponent(pathname)));
      if (!filePath.startsWith(ROOT)) {
        response.writeHead(403).end('forbidden');
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, {
        'content-type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  if (!playwright) {
    browserUnavailableReason =
      'Playwright is not installed; run: npm install --no-save --package-lock=false playwright';
    return;
  }
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (error) {
    browserUnavailableReason = `Chromium is unavailable for Playwright: ${error.message}`;
  }
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function openWorkbench(t) {
  if (!browser) {
    t.skip(browserUnavailableReason || 'browser unavailable');
    return null;
  }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 980 },
  });
  // Keep the run hermetic: only the local test server is real; every
  // other origin (the app's CDNs) gets an empty successful response.
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (
      url.startsWith(baseUrl) ||
      url.startsWith('data:') ||
      url.startsWith('blob:')
    ) {
      route.continue();
    } else {
      route.fulfill({
        status: 200,
        contentType: url.endsWith('.css')
          ? 'text/css; charset=utf-8'
          : 'text/javascript; charset=utf-8',
        body: '',
      });
    }
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const writeRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().startsWith(baseUrl)) {
      writeRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.goto(baseUrl + '/', { waitUntil: 'networkidle', timeout: 30000 });
  return { context, page, pageErrors, consoleErrors, writeRequests };
}

function assertClean({ pageErrors, consoleErrors, writeRequests }) {
  assert.deepEqual(pageErrors, [], `uncaught page errors: ${pageErrors}`);
  assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors}`);
  assert.deepEqual(
    writeRequests,
    [],
    `read-only guard: page issued non-GET requests: ${writeRequests}`,
  );
}

test('learning centre first screen renders its shell', async (t) => {
  const session = await openWorkbench(t);
  if (!session) return;
  const { context, page } = session;
  try {
    assert.match(await page.title(), /星赛通/);
    assert.equal(await page.locator('h1').innerText(), '星赛通');
    assert.equal(
      await page.locator('h2').first().innerText(),
      '星赛通 · 天文学习指挥台',
    );
    assertClean(session);
  } finally {
    await context.close();
  }
});

test('question bank evidence panel renders its review counts', async (t) => {
  const session = await openWorkbench(t);
  if (!session) return;
  const { context, page } = session;
  try {
    await page.waitForFunction(
      () =>
        document.querySelector('main') &&
        document.querySelector('main').innerText.includes('题库总量'),
      null,
      { timeout: 15000 },
    );
    const mainText = await page.locator('main').innerText();
    assert.match(mainText, /题库来源与事实核验/);
    assert.match(mainText, /已人工复核/);
    assertClean(session);
  } finally {
    await context.close();
  }
});

test('NASA exoplanet panel is mounted without loading data', async (t) => {
  const session = await openWorkbench(t);
  if (!session) return;
  const { context, page } = session;
  try {
    assert.equal(
      await page.locator('#nasaExoplanetExplorer').count(),
      1,
      'NASA exoplanet explorer panel must be mounted on the first screen',
    );
    const panelText = await page.locator('#nasaExoplanetExplorer').innerText();
    assert.match(panelText, /尚未请求数据/);
    assertClean(session);
  } finally {
    await context.close();
  }
});
