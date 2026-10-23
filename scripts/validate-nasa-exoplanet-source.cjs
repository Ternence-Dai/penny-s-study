'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const classroom = fs.readFileSync('assets/js/astronomy-classroom-v3.js', 'utf8');
const explorer = fs.readFileSync('assets/js/nasa-exoplanet-explorer-v1.js', 'utf8');
const css = fs.readFileSync('assets/css/nasa-exoplanet-explorer-v1.css', 'utf8');
const worker = fs.readFileSync('service-worker.js', 'utf8');

assert.ok(html.includes('nasa-exoplanet-explorer-v1.css?v=20261022-nasa-tap-v1') &&
          html.includes('nasa-exoplanet-explorer-v1.js?v=20261022-nasa-tap-v1'),
  'Penny entry point must load the NASA explorer and its styling');
assert.ok(classroom.includes('id="nasaExoplanetExplorer"') &&
          classroom.includes('data-nasa-exoplanet-load'),
  'astronomy command center must provide an explicit NASA data explorer');
assert.ok(explorer.includes("https://exoplanetarchive.ipac.caltech.edu/TAP/sync") &&
          explorer.includes('from pscomppars') &&
          explorer.includes('format'),
  'live data must use the NASA Exoplanet Archive TAP composite-parameters table');
for (const column of ['pl_name','hostname','discoverymethod','disc_year','pl_rade','pl_bmasse','pl_orbper','sy_dist']) {
  assert.ok(explorer.includes(column), 'NASA explorer must preserve the declared source column: ' + column);
}
assert.ok(explorer.includes("mode: 'cors'") &&
          explorer.includes("credentials: 'omit'") &&
          explorer.includes("cache: 'no-store'"),
  'NASA query must be read-only and must not send credentials');
assert.ok(explorer.includes('Number.isFinite(number)') &&
          explorer.includes('未发布'),
  'missing or invalid source values must remain missing, not be guessed or interpolated');
assert.ok(explorer.includes('实时读取未成功') &&
          explorer.includes('没有使用静态样例替代 NASA 数据') &&
          explorer.includes('csvUrl.href'),
  'network or upstream failure must show an explicit state and an official CSV fallback');
assert.ok(!explorer.includes('localStorage') &&
          !explorer.includes('Store.') &&
          !explorer.includes('window.Q'),
  'NASA catalog data must not be mixed into the authored question bank or local learning scores');
assert.ok(css.includes('.nasa-exoplanet-explorer__table-wrap') &&
          css.includes('.nasa-exoplanet-explorer__empty--warning') &&
          css.includes('overflow:auto'),
  'NASA result table must support empty, error and constrained-width states');
assert.ok(worker.includes("penny-study-shell-v26") &&
          worker.includes("nasa-exoplanet-explorer-v1.css?v=20261022-nasa-tap-v1") &&
          worker.includes("nasa-exoplanet-explorer-v1.js?v=20261022-nasa-tap-v1") &&
          worker.includes("reference-shell-v4-boot.js?v=20261022-reference-v6"),
  'PWA shell v26 must precache the NASA explorer and route-safe reference boot');
console.log('NASA Exoplanet Archive TAP integration and data-provenance checks passed.');
