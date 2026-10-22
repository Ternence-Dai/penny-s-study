/* Reference shell v4: promote the validated astronomy classroom to the default home workspace. */
(function () {
  'use strict';
  function mount() {
    const target = document.getElementById('view');
    if (!target || typeof window.renderAstronomyClassroom !== 'function') return false;
    const html = window.renderAstronomyClassroom();
    if (!html) return false;
    target.innerHTML = html;
    target.dataset.referenceMounted = 'v4';
    return true;
  }
  function scheduleMount() {
    window.setTimeout(mount, 0);
    window.setTimeout(mount, 220);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleMount, { once: true });
  } else scheduleMount();
  window.addEventListener('load', scheduleMount, { once: true });
  document.addEventListener('click', event => {
    const tab = event.target.closest('#tabbar [data-tab]');
    if (!tab) return;
    if ((tab.dataset.tab || '') === 'home') scheduleMount();
  });
})();