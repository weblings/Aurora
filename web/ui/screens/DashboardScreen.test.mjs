// DashboardScreen pause pair (Aurora-5ipy.13): the top bar shows Pause
// (pause glyph) while running and Resume (play glyph) while paused, beside
// a lighter-grey Stop; toggling PUTs /api/state with the flipped running
// flag. No DOM needed -- prototype-called methods against a container
// double, fetch stubbed per case. Run with
// `node screens/DashboardScreen.test.mjs`.
import assert from 'node:assert/strict';
import { DashboardScreen } from './DashboardScreen.js';
import { ensureTooltips } from '../Tooltips.js';

function makeEl() {
  return {
    innerHTML: '',
    listeners: {},
    addEventListener(event, fn) {
      (this.listeners[event] ??= []).push(fn);
    },
    querySelector() {
      return makeEl();
    },
    removeAttribute(name) {
      delete this[name];
    },
  };
}

// Outer container double: the top-bar slot element persists across renders
// so each _renderTopBar overwrites the same slot, like the real DOM.
function fakeScreen(overrides = {}) {
  const slot = makeEl();
  const stubs = new Map();
  slot.querySelector = (sel) => {
    if (!stubs.has(sel)) stubs.set(sel, makeEl());
    return stubs.get(sel);
  };
  const inst = Object.create(DashboardScreen.prototype);
  inst.paused = false;
  inst.pauseBusy = false;
  inst.topTierError = null;
  inst.container = { querySelector: (sel) => (sel === '.top-bar-slot' ? slot : makeEl()) };
  inst._renderTopTier = () => {};
  Object.assign(inst, overrides);
  return { inst, slot, stubs };
}

const realFetch = globalThis.fetch;

// Running: pause glyph + Pause label; Stop keeps the power glyph on the
// lighter-grey class.
{
  const { inst, slot } = fakeScreen();
  inst._renderTopBar();
  assert.ok(slot.innerHTML.includes('src="icons/pause-rockyroad.svg"'), 'pause glyph while running');
  assert.ok(slot.innerHTML.includes('aria-label="Pause"'), 'Pause label while running');
  assert.ok(slot.innerHTML.includes('src="icons/power-svgrepo-com.svg"'), 'power glyph present');
  assert.ok(slot.innerHTML.includes('top-bar-power-btn'), 'power button lighter than pause');
}

// Paused: play glyph + Resume label, same stable id.
{
  const { inst, slot } = fakeScreen({ paused: true });
  inst._renderTopBar();
  assert.ok(slot.innerHTML.includes('src="icons/play-rockyroad.svg"'), 'play glyph while paused');
  assert.ok(slot.innerHTML.includes('aria-label="Resume"'), 'Resume label while paused');
  assert.ok(slot.innerHTML.includes('id="top-bar-pause-btn"'), 'pause button id stable');
}

// Busy flight: pause disabled, stop untouched.
{
  const { inst, slot } = fakeScreen({ pauseBusy: true });
  inst._renderTopBar();
  const pauseTag = slot.innerHTML.match(/<button[^>]*id="top-bar-pause-btn"[^>]*>/)?.[0] ?? '';
  assert.ok(pauseTag.includes('disabled'), 'pause disabled mid-flight');
}

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { json: async () => handler(calls.length, options) };
  };
  return calls;
}

// Toggle while running pauses: PUT {running:false}, then reloads.
{
  const calls = stubFetch(() => ({ succeeded: true, running: false }));
  let reloaded = 0;
  const { inst, slot } = fakeScreen({ _loadAll: async () => { reloaded++; } });
  try {
    await inst._togglePause();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/state');
  assert.equal(calls[0].options.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].options.body), { running: false });
  assert.equal(reloaded, 1, 'sections reload after pause');
  assert.equal(inst.pauseBusy, false, 'busy flag resets');
  assert.ok(!slot.innerHTML.includes('disabled'), 'pause re-enabled after flight');
}

// Toggle while paused resumes: PUT {running:true}.
{
  const calls = stubFetch(() => ({ succeeded: true, running: true }));
  const { inst } = fakeScreen({ paused: true, _loadAll: async () => {} });
  try {
    await inst._togglePause();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(JSON.parse(calls[0].options.body), { running: true });
}

// Rejected PUT surfaces a pause/resume error and never reloads.
{
  const calls = stubFetch(() => ({ succeeded: false, error: 'boom' }));
  let reloaded = 0;
  let renderedTopTier = 0;
  const { inst } = fakeScreen({
    _loadAll: async () => { reloaded++; },
    _renderTopTier: () => { renderedTopTier++; },
  });
  try {
    await inst._togglePause();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls.length, 1);
  assert.equal(reloaded, 0, 'no reload on rejected toggle');
  assert.equal(inst.topTierError, "Couldn't pause Aurora.");
  assert.equal(renderedTopTier, 1);
}

// Unreachable daemon: same shape, reachability copy.
{
  globalThis.fetch = async () => { throw new Error('down'); };
  let renderedTopTier = 0;
  const { inst } = fakeScreen({ _renderTopTier: () => { renderedTopTier++; } });
  try {
    await inst._togglePause();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(inst.topTierError, "Couldn't reach the daemon.");
  assert.equal(renderedTopTier, 1);
  assert.equal(inst.pauseBusy, false);
}

// Tooltips land on the buttons themselves, where the hover does -- not the
// inner icons (which carry alt="").
{
  globalThis.fetch = async () => ({
    json: async () => ({
      descriptors: [
        { key: 'app.pause', description: 'Play/Pause' },
        { key: 'app.stop', description: 'Stop and Quit' },
      ],
    }),
  });
  try {
    await ensureTooltips();
  } finally {
    globalThis.fetch = realFetch;
  }
  // Render now the cache holds copy, so titles apply.
  const fresh = fakeScreen();
  fresh.inst._renderTopBar();
  assert.equal(fresh.stubs.get('#top-bar-pause-btn').title, 'Play/Pause');
  assert.equal(fresh.stubs.get('#top-bar-stop-btn').title, 'Stop and Quit');
}

// Double click mid-flight issues a single PUT.
{
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { json: async () => ({ succeeded: true, running: false }) };
  };
  const { inst } = fakeScreen({ _loadAll: async () => {} });
  try {
    await Promise.all([inst._togglePause(), inst._togglePause()]);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(fetches, 1, 'second click while busy is a no-op');
}

console.log('DashboardScreen pause checks passed.');
