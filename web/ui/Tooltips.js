// Central tooltip lookup (see docs/TooltipsAnalysis.md). The backend
// merges every module's descriptors into GET /api/descriptors; screens
// and components look up purely by key and never know which layer
// answered. Rendering uses the native `title` attribute for now (zero
// layout risk, NUX included); a styled custom renderer can replace the
// single applyTooltip call site later without touching callers.
//
// A missing key -- unknown, module compiled out, endpoint absent on an
// old binary, fetch failed -- yields null, and the control renders
// exactly as without tooltips. Tooltips never gate rendering: call
// ensureTooltips() fire-and-forget (app.js bootstrap does), and every
// render applies synchronously from whatever has arrived so far.
let cache = null;
let pending = null;

export function ensureTooltips() {
  if (!pending) {
    pending = (async () => {
      try {
        const result = await (await fetch('/api/descriptors')).json();
        const map = {};
        for (const entry of result.descriptors ?? []) {
          if (entry.key && entry.description) map[entry.key] = entry.description;
        }
        cache = map;
      } catch {
        cache = {};
      }
    })();
  }
  return pending;
}

export function tooltipFor(key) {
  return cache?.[key] ?? null;
}

// Native title tooltip when a description exists; removes any stale
// title otherwise, so re-rendered or persistent nodes (e.g. Dropdown's
// trigger across setOptions) never show an outdated one.
export function applyTooltip(element, key) {
  if (!element) return;
  const text = key ? tooltipFor(key) : null;
  if (text) element.title = text;
  else element.removeAttribute('title');
}
