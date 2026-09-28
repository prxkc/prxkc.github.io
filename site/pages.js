/* Pages on one wall.
 *
 * One section shows at a time and the others are
 * hidden; links to the section IDs swap them in place (with the
 * URL hash kept in step, so pages are linkable and the back button works).
 * ← → step through them; 1–4 jump to them.
 */
(() => {
  'use strict';

  const pages = Array.from(document.querySelectorAll('.page'));
  const ids = pages.map((p) => p.id);
  if (!ids.length) return;
  const links = Array.from(document.querySelectorAll('a[href^="#"]')).filter((a) => ids.includes(a.hash.slice(1)));
  const siteName = document.title;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let current = null, timer = 0;

  const fromHash = () => (ids.includes(location.hash.slice(1)) ? location.hash.slice(1) : ids[0]);

  function show(id, focus) {
    if (id === current) return;
    const prev = pages.find((p) => !p.hidden);
    const next = pages.find((p) => p.id === id);
    current = id;
    clearTimeout(timer);
    for (const a of links) {
      if (a.hash === '#' + id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    const swap = () => {
      for (const p of pages) { p.hidden = p !== next; p.classList.remove('is-leaving', 'is-entering'); }
      void next.offsetWidth;                       // restart the entrance animation
      next.classList.add('is-entering');
      if (focus) {
        next.tabIndex = -1;
        next.focus({ preventScroll: true });
        // Every page starts at the same portrait position, including after a long page.
        if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' });
      }
      document.title = id === ids[0] ? siteName : `${next.dataset.title || id} · ${siteName}`;
    };
    if (prev && prev !== next && !reduce.matches) { prev.classList.remove('is-entering'); prev.classList.add('is-leaving'); timer = setTimeout(swap, 140); }
    else swap();
  }

  function go(id) {
    if (id === current) return;
    try {
      history.pushState(null, '', id === ids[0] ? location.pathname + location.search : '#' + id);
    } catch (e) {
      location.hash = id;
    }
    show(id, true);
  }

  addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href^="#"]');
    if (!a || !ids.includes(a.hash.slice(1))) return;
    e.preventDefault();
    go(a.hash.slice(1));
  });

  addEventListener('popstate', () => show(fromHash(), false));
  addEventListener('hashchange', () => show(fromHash(), false));

  // ← and → step through the pages; 1–4 jump to them and 0 goes home.
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (/^[0-9]$/.test(e.key)) { if (ids[+e.key]) go(ids[+e.key]); return; }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = ids.indexOf(current) + (e.key === 'ArrowRight' ? 1 : -1);
    if (i >= 0 && i < ids.length) go(ids[i]);
  });

  show(fromHash(), false);
})();
