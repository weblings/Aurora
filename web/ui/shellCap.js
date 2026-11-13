// The error shell's safety cap (Aurora-9hqa.3), shared by the Dashboard (shell.js) and the graph
// editor (graph-editor/src/ErrorShell.tsx). The rows live in one region, `.shell-banner-rows`, capped
// at 60vh by styles/shell.css; the toggle sits outside it. Normally every row fits and none of this
// shows. Over the cap (the rare 5-6 row case) this module:
//   - marks the region scrollable only while it overflows (tabindex=0 and an aria-label, so a keyboard
//     user can scroll it) and keeps the edge fades true to what lies beyond each edge;
//   - scrolls the first NEW row into view, never resetting scrollTop on an ordinary redraw;
//   - holds every new row's pulse (data-wait pauses the animation) until an IntersectionObserver sees
//     the row, then lets it run and starts its fallback timer then, not before.
// Design: docs/log/2026-11-13-u8jx14-shell-spotlight-mock.md. Layout, IntersectionObserver and
// scrolling exist only in a browser, so the pure choice below is unit-tested (shellCap.test.mjs) and
// the rest is covered by the browser check shell-cap (tools/browser-check, both pages).

// How far past the arriving row to scroll, so it is clear of the edge fade (styles/shell.css).
export const SCROLL_MARGIN_PX = 28;
// The arrival pulse is 1375 ms; this clears data-new if animationend never comes (a hidden tab).
export const PULSE_FALLBACK_MS = 2000;
export const REGION_LABEL = 'Notices and errors, scrollable';

// The key of the first new row in drawn order, or null. Only keys in `freshKeys` count, so an older
// row that is still waiting (not yet seen, but not an arrival of this draw) is never chosen.
export function firstNewKey(drawnKeys, freshKeys) {
  const fresh = new Set(freshKeys);
  return drawnKeys.find((key) => fresh.has(key)) ?? null;
}

// Where to put scrollTop so a row at [top, bottom] (px from the region's scroll origin) clears the
// edges by `margin`; the current scrollTop when it already does. A row taller than the window aligns
// its top.
export function scrollTopFor({ top, bottom, scrollTop, height, margin = SCROLL_MARGIN_PX }) {
  if (bottom - top > height - 2 * margin) return Math.max(0, top - margin);
  if (top - margin < scrollTop) return Math.max(0, top - margin);
  if (bottom + margin > scrollTop + height) return bottom + margin - height;
  return scrollTop;
}

const keyOf = (node) => node.getAttribute('data-key');

// One per page. `onPulseDone(node)` ends a pulse (the Dashboard drops data-new, the editor drops the
// key from its pulsing state); it is called on animationend elsewhere and, as the fallback, here.
export function createShellCap({ onPulseDone }) {
  let region = null;
  let resizeObserver = null;
  let visibility = null;
  const tracked = new WeakSet(); // rows whose arrival this cap has already handled
  const timers = new Set();

  const startTimer = (node) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (node.hasAttribute('data-new')) onPulseDone(node);
    }, PULSE_FALLBACK_MS);
    timer.unref?.();
    timers.add(timer);
  };

  // A row's pulse starts: the pause comes off, and only now does the fallback timer start.
  const release = (node) => {
    visibility?.unobserve(node);
    if (!node.hasAttribute('data-wait')) return;
    node.removeAttribute('data-wait');
    startTimer(node);
  };

  const sync = () => {
    if (!region) return;
    const over = region.scrollHeight > region.clientHeight + 1;
    region.classList.toggle('shell-over', over);
    region.classList.toggle('shell-less', over && region.scrollTop > 1);
    region.classList.toggle('shell-more', over && region.scrollTop + region.clientHeight < region.scrollHeight - 1);
    if (over) {
      region.setAttribute('tabindex', '0');
      region.setAttribute('role', 'group');
      region.setAttribute('aria-label', REGION_LABEL);
    } else {
      region.removeAttribute('tabindex');
      region.removeAttribute('role');
      region.removeAttribute('aria-label');
    }
    return over;
  };

  const attach = (next) => {
    if (region === next) return;
    detach();
    region = next;
    if (!region) return;
    region.addEventListener('scroll', sync, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(sync);
      resizeObserver.observe(region);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      visibility = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            // Fully in view, or filling the window when the row is taller than it.
            const full = entry.intersectionRatio >= 0.99 || (entry.rootBounds && entry.intersectionRect.height >= entry.rootBounds.height - 2);
            if (entry.isIntersecting && full) release(entry.target);
          }
        },
        { root: region, threshold: [0, 0.5, 0.99, 1] },
      );
    }
  };

  const detach = () => {
    region?.removeEventListener('scroll', sync);
    resizeObserver?.disconnect();
    visibility?.disconnect();
    resizeObserver = null;
    visibility = null;
    region = null;
  };

  const onWindowResize = () => sync();
  if (typeof window !== 'undefined') window.addEventListener('resize', onWindowResize);

  return {
    // Call after every draw of the slot, once its rows are in the DOM.
    render(slot) {
      const found = slot?.querySelector?.('.shell-banner-rows') ?? null;
      // Only a real element (a unit-test slot double answers querySelector with a stand-in).
      attach(typeof found?.getBoundingClientRect === 'function' ? found : null);
      if (!region) return;
      const rows = [...region.children];
      const fresh = rows.filter((node) => node.hasAttribute('data-new') && !tracked.has(node));
      // Held before the layout read below, so a row that cannot be seen yet never starts its ring.
      for (const node of fresh) {
        tracked.add(node);
        node.setAttribute('data-wait', '');
      }
      const over = sync();
      if (fresh.length === 0) return;
      if (!over || !visibility) {
        // Everything is on screen (or no observer to ask): pulse now.
        for (const node of fresh) release(node);
        return;
      }
      const target = rows.find((node) => keyOf(node) === firstNewKey(rows.map(keyOf), fresh.map(keyOf)));
      if (target) {
        const box = region.getBoundingClientRect();
        const at = target.getBoundingClientRect();
        const top = at.top - box.top + region.scrollTop;
        const next = scrollTopFor({ top, bottom: top + at.height, scrollTop: region.scrollTop, height: region.clientHeight });
        if (next !== region.scrollTop) {
          const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
          region.scrollTo({ top: next, behavior: calm ? 'auto' : 'smooth' });
        }
      }
      for (const node of fresh) visibility.observe(node);
    },
    dispose() {
      detach();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      if (typeof window !== 'undefined') window.removeEventListener('resize', onWindowResize);
    },
  };
}
