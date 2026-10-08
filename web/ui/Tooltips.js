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
//
// The same payload carries each numeric setting's `param` (label, min, max,
// step, unit, default, allowsUnset -- Aurora-ta5): the backend's one
// definition of a slider's range, which its Config setter also clamps to.
// Unlike tooltips, Tuning's sliders do wait for these (see TuningFields).
let cache = null;
let params = null;
let pending = null;

export function ensureTooltips() {
  if (!pending) {
    pending = (async () => {
      try {
        const result = await (await fetch('/api/descriptors')).json();
        const map = {};
        const paramMap = {};
        for (const entry of result.descriptors ?? []) {
          if (entry.key && entry.description) map[entry.key] = entry.description;
          if (entry.key && entry.param) paramMap[entry.key] = entry.param;
        }
        cache = map;
        params = paramMap;
      } catch {
        cache = {};
        params = {};
      }
    })();
  }
  return pending;
}

// True once the descriptors fetch has settled (success or failure).
export function descriptorsSettled() {
  return params !== null;
}

// A numeric setting's schema by descriptor key, or null (not loaded yet,
// unknown key, or an old binary without params).
export function paramFor(key) {
  return params?.[key] ?? null;
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
