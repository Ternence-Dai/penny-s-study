/* NASA Exoplanet Archive TAP reader.
   Read-only public reference data; never mixed with the local question bank or learner records. */
(function () {
  'use strict';

  const ENDPOINT = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
  const ADQL = 'select top 12 pl_name,hostname,discoverymethod,disc_year,pl_rade,pl_bmasse,pl_orbper,sy_dist from pscomppars order by disc_year desc';
  const sourceUrl = new URL(ENDPOINT);
  sourceUrl.searchParams.set('query', ADQL);
  sourceUrl.searchParams.set('format', 'json');
  const csvUrl = new URL(ENDPOINT);
  csvUrl.searchParams.set('query', ADQL);
  csvUrl.searchParams.set('format', 'csv');

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]);
    });
  }
  function numberCell(value, digits) {
    if (value == null || value === '') return '未发布';
    const number = Number(value);
    if (!Number.isFinite(number)) return '未发布';
    return number.toLocaleString('en-US', { maximumFractionDigits: digits });
  }
  function getRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.results)) return payload.results;
    throw new Error('NASA TAP 返回结构与预期不符；没有把未知字段转换为行星参数。');
  }
  function renderRows(panel, rows) {
    const target = panel.querySelector('[data-nasa-exoplanet-results]');
    if (!rows.length) {
      target.innerHTML = '<div class="nasa-exoplanet-explorer__empty">NASA 当前查询未返回记录。请打开官方数据站检查筛选条件。</div>';
      return;
    }
    const tableRows = rows.map(function (row) {
      return '<tr>' +
        '<th scope="row">' + escapeHtml(row.pl_name || '未命名记录') + '</th>' +
        '<td>' + escapeHtml(row.hostname || '未发布') + '</td>' +
        '<td>' + escapeHtml(row.discoverymethod || '未发布') + '</td>' +
        '<td>' + escapeHtml(row.disc_year == null ? '未发布' : row.disc_year) + '</td>' +
        '<td class="num">' + numberCell(row.pl_rade, 3) + '</td>' +
        '<td class="num">' + numberCell(row.pl_bmasse, 3) + '</td>' +
        '<td class="num">' + numberCell(row.pl_orbper, 4) + '</td>' +
        '<td class="num">' + numberCell(row.sy_dist, 2) + '</td>' +
      '</tr>';
    }).join('');
    target.innerHTML = '<div class="nasa-exoplanet-explorer__table-scroll"><table>' +
      '<thead><tr><th>行星</th><th>宿主恒星</th><th>发现方法</th><th>发现年份</th>' +
      '<th>半径 (R⊕)</th><th>质量 (M⊕)</th><th>轨道周期 (day)</th><th>距离 (pc)</th></tr></thead>' +
      '<tbody>' + tableRows + '</tbody></table></div>';
  }
  async function load(panel) {
    const button = panel.querySelector('[data-nasa-exoplanet-load]');
    const state = panel.querySelector('[data-nasa-exoplanet-state]');
    const results = panel.querySelector('[data-nasa-exoplanet-results]');
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = '正在读取 NASA 数据…';
    state.textContent = '正在查询 NASA Exoplanet Archive TAP · 最近 12 条综合参数记录';
    results.innerHTML = '<div class="nasa-exoplanet-explorer__empty">正在向 NASA 官方数据服务请求；不会从本机演示题库取值。</div>';
    const controller = new AbortController();
    const timeout = window.setTimeout(function () { controller.abort(); }, 25000);
    try {
      const response = await fetch(sourceUrl.href, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error('NASA TAP HTTP ' + response.status);
      const payload = await response.json();
      const rows = getRows(payload).slice(0, 12);
      renderRows(panel, rows);
      const timestamp = new Date().toLocaleString();
      state.textContent = '读取成功 · ' + rows.length + ' 条 · 本机取数时间 ' + timestamp + ' · 原始数据来自 NASA TAP';
    } catch (error) {
      const reason = error && error.name === 'AbortError'
        ? '请求超过 25 秒，已停止等待。'
        : (error && error.message ? error.message : '网络或跨域访问失败。');
      state.textContent = '实时读取未成功 · ' + reason;
      results.innerHTML = '<div class="nasa-exoplanet-explorer__empty nasa-exoplanet-explorer__empty--warning">' +
        '<b>没有使用静态样例替代 NASA 数据。</b><p>当前浏览器无法读取 TAP 响应时，请打开 NASA 官方查询或下载 CSV；数据可用前不会显示伪造的行星记录。</p>' +
        '<a href="' + escapeHtml(csvUrl.href) + '" target="_blank" rel="noopener noreferrer">尝试打开 NASA 官方 CSV 查询 ↗</a></div>';
    } finally {
      window.clearTimeout(timeout);
      button.disabled = false;
      button.textContent = '刷新 NASA 数据';
    }
  }

  document.addEventListener('click', function (event) {
    const button = event.target.closest('[data-nasa-exoplanet-load]');
    if (!button) return;
    const panel = button.closest('#nasaExoplanetExplorer');
    if (panel) load(panel);
  });

  function bindLinks() {
    const panel = document.getElementById('nasaExoplanetExplorer');
    if (!panel || panel.dataset.sourceBound === 'true') return;
    panel.dataset.sourceBound = 'true';
    const json = panel.querySelector('[data-nasa-exoplanet-json]');
    const csv = panel.querySelector('[data-nasa-exoplanet-csv]');
    if (json) json.href = sourceUrl.href;
    if (csv) csv.href = csvUrl.href;
  }
  const observer = new MutationObserver(bindLinks);
  function start() {
    const view = document.getElementById('view');
    if (view) observer.observe(view, { childList: true, subtree: true });
    bindLinks();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.NasaExoplanetExplorer = Object.freeze({
    endpoint: ENDPOINT,
    query: ADQL,
    sourceUrl: sourceUrl.href,
    csvUrl: csvUrl.href
  });
})();