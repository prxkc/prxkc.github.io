/* Pages on one wall.
 *
 * One section shows at a time. An inline script in <head> picks the first
 * one from the URL hash before paint (CSS reads html[data-page]); this file
 * takes over from there. Links to the section IDs swap pages in place, with
 * the hash kept in step so pages are linkable and the back button works.
 * ← → step through them, 1–4 jump to them, and 0 or Esc goes home.
 */
(() => {
  'use strict';

  const root = document.documentElement;
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
    // data-page changes only on a swap, so it names the page actually on screen.
    const prev = pages.find((p) => p.id === root.dataset.page);
    const next = pages.find((p) => p.id === id);
    current = id;
    clearTimeout(timer);
    for (const a of links) {
      if (a.hash === '#' + id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    // Showing a page restarts its CSS entrance, so the swap only flips data-page.
    const swap = () => {
      root.dataset.page = id;
      for (const p of pages) p.classList.remove('is-leaving');
      if (focus) {
        next.tabIndex = -1;
        next.focus({ preventScroll: true });
        // Every page starts at the same portrait position, including after a long page.
        if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' });
      }
      document.title = id === ids[0] ? siteName : `${next.dataset.title || id} · ${siteName}`;
    };
    if (prev && prev !== next && !reduce.matches) {
      prev.classList.add('is-leaving');
      timer = setTimeout(swap, 160);
    } else swap();
  }

  function go(id) {
    if (id === current) return;
    try {
      history.pushState(null, '', id === ids[0] ? location.pathname + location.search : '#' + id);
    } catch (e) {
      location.hash = id;
    }
    show(id, true);
    // Turning a page sends a breeze through the leaves on the wall.
    dispatchEvent(new CustomEvent('minifolio:gust'));
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

  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key === 'Escape') { go(ids[0]); return; }
    if (/^[0-9]$/.test(e.key)) { if (ids[+e.key]) go(ids[+e.key]); return; }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = ids.indexOf(current) + (e.key === 'ArrowRight' ? 1 : -1);
    if (i >= 0 && i < ids.length) go(ids[i]);
  });

  // The address bar may carry a page name; keep the wall at its resting position.
  if (location.hash) {
    const rest = () => window.scrollY > 0 && window.scrollTo(0, 0);
    requestAnimationFrame(rest);
    addEventListener('load', rest, { once: true });
  }

  // Copy the email address in place, with a quiet confirmation.
  const copy = document.querySelector('[data-copy]');
  const status = document.getElementById('copy-status');
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* older or stricter browsers */ }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.append(area);
    area.select();
    let done = false;
    try { done = document.execCommand('copy'); } catch (e) { done = false; }
    area.remove();
    copy.focus({ preventScroll: true });
    return done;
  }
  if (copy) {
    let reset = 0;
    copy.hidden = false;
    copy.addEventListener('click', async () => {
      const done = await copyText(copy.dataset.copy);
      copy.textContent = done ? 'copied' : 'copy failed';
      if (status) status.textContent = done ? 'Email address copied' : 'Could not copy the email address';
      clearTimeout(reset);
      reset = setTimeout(() => { copy.textContent = 'copy'; if (status) status.textContent = ''; }, 1800);
    });
  }

  show(fromHash(), false);
})();
