// App shell connection watcher (Aurora-ewyz, single-variant takeover
// Aurora-yzp4): the beat takes `failureThreshold` consecutive failed polls
// to raise the heading-only 'Aurora has stopped' takeover (one blip never
// shows), recovery calls onRecovered once with the preserved route,
// confirmed Stop keeps the same overlay and keeps polling until the daemon
// answers, and concurrent checkNow() triggers share one poll. No DOM
// needed -- document and fetchStatus doubles, real timers with tiny
// intervals. Run with `node shell.test.mjs`.
import assert from 'node:assert/strict';
import { App } from './shell.js';

function makeButton() {
  return {
    handlers: {},
    addEventListener(event, fn) {
      (this.handlers[event] ??= []).push(fn);
    },
    click() {
      for (const fn of this.handlers.click ?? []) fn();
    },
  };
}

function makeSlot() {
  const buttons = new Map();
  return {
    innerHTML: '',
    buttons,
    querySelector(sel) {
      if (!buttons.has(sel)) buttons.set(sel, makeButton());
      return buttons.get(sel);
    },
  };
}

const realDocument = globalThis.document;
function installDom() {
  const slots = new Map();
  globalThis.document = {
    getElementById(id) {
      if (!slots.has(id)) slots.set(id, makeSlot());
      return slots.get(id);
    },
  };
  return slots;
}
function uninstallDom() {
  globalThis.document = realDocument;
}

function makeApp(fetchStatus, opts = {}) {
  const slots = installDom();
  const recovered = [];
  const app = new App({
    fetchStatus,
    pollIntervalMs: 100000,
    abortTimeoutMs: 50,
    ...opts,
  });
  app.onRecovered = (id) => recovered.push(id);
  const overlay = () => slots.get('shell-overlay-slot').innerHTML;
  const banner = () => slots.get('shell-banner-slot').innerHTML;
  return { app, slots, recovered, overlay, banner };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ok = () => async () => ({ reachable: true });
const down = (calls) => async () => { calls.count++; throw new Error('down'); };
const blankScreen = () => ({ mount() {}, unmount() {} });

// Two consecutive failed polls raise the heading-only takeover, keep the
// preserved route, and do not call onRecovered.
{
  const calls = { count: 0 };
  const { app, recovered, overlay } = makeApp(down(calls));
  app.navigate(blankScreen(), 'dashboard');
  assert.equal(await app._pollOnce(), false);
  assert.equal(overlay(), '', 'one blip never shows the takeover');
  assert.equal(app.connectionState, 'live');
  assert.equal(await app._pollOnce(), false);
  assert.ok(overlay().includes('Aurora has stopped'), 'takeover copy');
  assert.ok(!overlay().includes('<button'), 'no button');
  assert.ok(!overlay().includes('<p'), 'no body copy');
  assert.equal(app.connectionState, 'down');
  assert.equal(app.preservedRouteId, 'dashboard');
  assert.deepEqual(recovered, []);
  uninstallDom();
}

// A failure followed by success leaves no takeover behind.
{
  let fail = true;
  const calls = { count: 0 };
  const { app, overlay } = makeApp(async () => {
    calls.count++;
    if (fail) throw new Error('down');
    return { reachable: true };
  });
  assert.equal(await app._pollOnce(), false);
  fail = false;
  assert.equal(await app._pollOnce(), true);
  assert.equal(overlay(), '');
  assert.equal(app.connectionState, 'live');
  assert.equal(calls.count, 2);
  uninstallDom();
}

// Recovery clears the overlay and calls onRecovered exactly once with the
// preserved route, even across further successes.
{
  let fail = true;
  const { app, recovered, overlay } = makeApp(async () => {
    if (fail) throw new Error('down');
    return { reachable: true };
  });
  app.navigate(blankScreen(), 'output-connect');
  await app._pollOnce();
  await app._pollOnce();
  assert.equal(app.connectionState, 'down');
  fail = false;
  assert.equal(await app._pollOnce(), true);
  assert.equal(overlay(), '', 'overlay cleared on recovery');
  assert.deepEqual(recovered, ['output-connect']);
  assert.equal(await app._pollOnce(), true);
  assert.deepEqual(recovered, ['output-connect'], 'onRecovered called once');
  assert.equal(app.preservedRouteId, null);
  uninstallDom();
}

// Confirmed Stop keeps the same heading-only overlay and keeps polling;
// the overlay clears on its own (via onRecovered) when the daemon answers.
{
  let fail = true;
  const { app, recovered, overlay } = makeApp(async () => {
    if (fail) throw new Error('down');
    return { reachable: true };
  });
  app.navigate(blankScreen(), 'dashboard');
  app.startHeartbeat();
  app.notifyStopConfirmed();
  assert.ok(overlay().includes('Aurora has stopped'), 'intentional copy');
  assert.ok(!overlay().includes('<button'), 'no button');
  assert.ok(!overlay().includes('<p'), 'no body copy');
  assert.equal(app.connectionState, 'stopped');
  assert.notEqual(app._beatTimer, null, 'keeps polling for recovery');
  assert.equal(await app.checkNow(), false, 'still down');
  assert.ok(overlay().includes('Aurora has stopped'), 'same copy while down');
  fail = false;
  assert.equal(await app.checkNow(), true);
  assert.equal(overlay(), '', 'overlay cleared on recovery');
  assert.deepEqual(recovered, ['dashboard']);
  assert.equal(app.preservedRouteId, null);
  app.stopHeartbeat();
  uninstallDom();
}

// A tray/quit Stop sends no signal: the same overlay shows and keeps
// polling (the beat timer is still armed).
{
  const calls = { count: 0 };
  const { app, overlay } = makeApp(down(calls), { pollIntervalMs: 10 });
  app.startHeartbeat();
  await sleep(40);
  assert.ok(overlay().includes('Aurora has stopped'), 'same overlay without a signal');
  assert.equal(app.connectionState, 'down');
  assert.notEqual(app._beatTimer, null, 'keeps polling for recovery');
  app.stopHeartbeat();
  uninstallDom();
}

// Concurrent checkNow() triggers share one poll.
{
  const calls = { count: 0 };
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { app } = makeApp(async () => {
    calls.count++;
    await gate;
    return { reachable: true };
  });
  const results = await Promise.all([app.checkNow(), app.checkNow(), app.checkNow()].map((p, i) => {
    if (i === 2) release();
    return p;
  }));
  // The third trigger releases the gate; all three shared the one flight.
  assert.equal(calls.count, 1, 'one fetch for concurrent triggers');
  assert.deepEqual(results, [true, true, true]);
  uninstallDom();
}

// A slow poll never overlaps the next beat: max one fetch in flight.
{
  let active = 0;
  let maxActive = 0;
  const { app } = makeApp(async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await sleep(20);
    active--;
    return { reachable: true };
  }, { pollIntervalMs: 5 });
  app.startHeartbeat();
  await sleep(60);
  app.stopHeartbeat();
  assert.equal(maxActive, 1, 'beats share the in-flight poll');
  uninstallDom();
}

// A hung poll aborts on its own timer instead of hanging the beat.
{
  const { app } = makeApp(
    (signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }),
    { abortTimeoutMs: 10 },
  );
  assert.equal(await app.checkNow(), false, 'aborted poll reads as unreachable');
  uninstallDom();
}

// Failure taxonomy (default fetchStatus against a fetch stub): any HTTP
// answer -- even a 500, even one with an unreadable body -- counts as
// reachable. Only a rejected fetch (network error/abort) counts as gone.
{
  const realFetch = globalThis.fetch;
  const { app } = makeApp(undefined);
  try {
    globalThis.fetch = async () => ({ status: 500, json: async () => ({ succeeded: false }) });
    assert.equal(await app._pollOnce(), true, '500 with JSON is reachable');
    globalThis.fetch = async () => ({ status: 500, json: async () => { throw new Error('empty'); } });
    assert.equal(await app._pollOnce(), true, '500 without JSON is reachable');
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    assert.equal(await app._pollOnce(), false, 'rejected fetch is unreachable');
  } finally {
    globalThis.fetch = realFetch;
  }
  uninstallDom();
}

// showUnreachable (boot/stage path) raises the takeover and arms the beat;
// the intentional path shows the same overlay and keeps polling.
{
  const { app, overlay } = makeApp(ok());
  app.showUnreachable();
  assert.ok(overlay().includes('Aurora has stopped'));
  assert.notEqual(app._beatTimer, null, 'beat armed for recovery');
  app.stopHeartbeat();
  app.notifyStopConfirmed();
  assert.ok(overlay().includes('Aurora has stopped'), 'single variant');
  assert.notEqual(app._beatTimer, null, 'stopped keeps polling');
  app.stopHeartbeat();
  uninstallDom();
}

// navigate() records route ids; a navigate without one keeps the last.
{
  const { app } = makeApp(ok());
  app.navigate(blankScreen(), 'mode-device');
  assert.equal(app.currentRouteId, 'mode-device');
  app.navigate(blankScreen());
  assert.equal(app.currentRouteId, 'mode-device');
  uninstallDom();
}

// ---- System-error banner (Aurora-cj11) ----

const stateOk = (extra = {}) => async () => ({ reachable: true, state: 'running', errors: [], paused: false, ...extra });

// No errors: banner stays empty.
{
  const { app, banner } = makeApp(stateOk());
  await app._pollOnce();
  assert.equal(banner(), '');
  uninstallDom();
}

// One error: shown in full, never collapsed, with a Retry button keyed to
// its source.
{
  const { app, banner } = makeApp(stateOk({ state: 'failed', errors: [{ source: 'startup', message: 'No outputs available' }] }));
  await app._pollOnce();
  assert.ok(banner().includes("Couldn't start: No outputs available"), 'startup rows carry their source prefix');
  assert.ok(banner().includes('id="shell-banner-retry-startup"'));
  assert.ok(!banner().includes('problems'), 'a single error never collapses');
  uninstallDom();
}

// Two or more collapse to a summary line; expanding shows every row, each
// with its own source-keyed Retry button.
{
  const errors = [
    { source: 'startup', message: 'No outputs available' },
    { source: 'resume', message: 'bridge unreachable' },
  ];
  const { app, banner, slots } = makeApp(stateOk({ state: 'failed', errors }));
  await app._pollOnce();
  assert.ok(banner().includes('2 problems'), 'collapsed summary');
  assert.ok(!banner().includes('No outputs available'), 'rows hidden while collapsed');
  slots.get('shell-banner-slot').querySelector('#shell-banner-expand').click();
  assert.ok(banner().includes('No outputs available'));
  assert.ok(banner().includes("Couldn't resume: bridge unreachable"));
  assert.ok(banner().includes('id="shell-banner-retry-startup"'));
  assert.ok(banner().includes('id="shell-banner-retry-resume"'));
  uninstallDom();
}

// A permission-prefixed error on Mac reuses renderReloadError (Retry button
// only, with "answer the prompt, then press Retry" copy) instead of the
// generic row.
{
  const { app, banner } = makeApp(stateOk({
    state: 'failed',
    errors: [{ source: 'startup', message: 'permission_denied: ScreenCaptureKitGrabber: no shareable displays' }],
  }));
  app.platform = 'mac';
  await app._pollOnce();
  assert.ok(banner().includes('Open Settings'), 'denied row offers the Settings link (macOS will not re-prompt)');
  assert.ok(banner().includes('Privacy_ScreenCapture'));
  assert.ok(banner().includes('id="shell-banner-retry-startup"'), 'permission row has a Retry button');
  assert.ok(banner().includes('Screen Recording is off.'));
  assert.ok(banner().includes('Allow it in the macOS prompt if one appears, or turn it on in System Settings, then Retry.'));
  assert.ok(banner().indexOf('shell-banner-retry-startup') < banner().indexOf('Open Settings'), 'Retry first, Settings second');
  assert.ok(!banner().includes('macOS won\'t ask again'), 'banner uses the retry copy, not the quit+relaunch copy');
  uninstallDom();
}
{
  // permission_pending: the macOS prompt is the fix, so Retry only, no link.
  const { app, banner } = makeApp(stateOk({
    state: 'failed',
    errors: [{ source: 'startup', message: 'permission_pending: prompt shown' }],
  }));
  app.platform = 'mac';
  await app._pollOnce();
  assert.ok(banner().includes('Screen Recording is off.'));
  assert.ok(banner().includes('id="shell-banner-retry-startup"'));
  assert.ok(!banner().includes('Open Settings'), 'pending row is Retry-only');
  uninstallDom();
}
{
  // Same message, unknown platform: renders generic (Retry), never guesses Mac.
  const { app, banner } = makeApp(stateOk({
    state: 'failed',
    errors: [{ source: 'startup', message: 'permission_denied: ScreenCaptureKitGrabber: no shareable displays' }],
  }));
  await app._pollOnce();
  assert.ok(banner().includes('id="shell-banner-retry-startup"'));
  assert.ok(!banner().includes('Open Settings'));
  uninstallDom();
}

// Retry: a failed-host source posts /api/reload; a failed-resume source
// PUTs /api/state {running:true}. Either way it re-checks afterward.
{
  const realFetch = globalThis.fetch;
  const retryCalls = [];
  globalThis.fetch = async (url, options) => {
    retryCalls.push({ url, options });
    return { status: 200, json: async () => ({ succeeded: true }) };
  };
  try {
    const { app, slots } = makeApp(stateOk({ state: 'failed', errors: [{ source: 'startup', message: 'boom' }] }));
    await app._pollOnce();
    slots.get('shell-banner-slot').querySelector('#shell-banner-retry-startup').click();
    await Promise.resolve(); // let the retry's own await chain settle
    await Promise.resolve();
    assert.equal(retryCalls[0].url, '/api/reload');
    assert.equal(retryCalls[0].options.method, 'POST');
    uninstallDom();
  } finally {
    globalThis.fetch = realFetch;
  }
}
{
  const realFetch = globalThis.fetch;
  const retryCalls = [];
  globalThis.fetch = async (url, options) => {
    retryCalls.push({ url, options });
    return { status: 200, json: async () => ({ succeeded: true }) };
  };
  try {
    const { app, slots } = makeApp(stateOk({ state: 'paused', errors: [{ source: 'resume', message: 'bridge unreachable' }] }));
    await app._pollOnce();
    slots.get('shell-banner-slot').querySelector('#shell-banner-retry-resume').click();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(retryCalls[0].url, '/api/state');
    assert.equal(retryCalls[0].options.method, 'PUT');
    assert.deepEqual(JSON.parse(retryCalls[0].options.body), { running: true });
    uninstallDom();
  } finally {
    globalThis.fetch = realFetch;
  }
}

// Onboarding gate: a 'reload' source is the mid-onboarding "no outputs
// paired" failure -- hidden on any route before the Dashboard, shown once
// the Dashboard route is reached (ErrorOverlay.md's onboarding-gate note).
{
  const blankScreen = () => ({ mount() {}, unmount() {} });
  const { app, banner } = makeApp(stateOk({ state: 'failed', errors: [{ source: 'reload', message: 'No outputs available' }] }));
  app.navigate(blankScreen(), 'mode-device');
  await app._pollOnce();
  assert.equal(banner(), '', 'reload error gated during NUX');
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  assert.ok(banner().includes("Couldn't apply settings: No outputs available"), 'reload error shown once Dashboard is reached');
  uninstallDom();
}
// A non-'reload' source is never gated, even mid-onboarding (a startup
// failure is real regardless of NUX progress).
{
  const blankScreen = () => ({ mount() {}, unmount() {} });
  const { app, banner } = makeApp(stateOk({ state: 'failed', errors: [{ source: 'startup', message: 'boom' }] }));
  app.navigate(blankScreen(), 'welcome');
  await app._pollOnce();
  assert.ok(banner().includes('boom'), 'startup error is never gated');
  uninstallDom();
}

// ---- Banner X and saved-not-applied copy (Aurora-98pr) ----

const HELD = { source: 'reload', message: 'bridge unreachable', id: 7 };

// Running host with a held reload error: saved-not-applied copy, an X, and
// the same source-keyed Retry (POST /api/reload, no new retry rule).
{
  const { app, banner, slots } = makeApp(stateOk({ errors: [HELD] }));
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  assert.ok(banner().includes("Saved, but couldn't apply: bridge unreachable. Aurora is still running your previous setup and will try the new one next time it starts."));
  assert.ok(banner().includes('id="shell-banner-dismiss-reload"'), 'X on a running host');
  assert.ok(banner().includes('id="shell-banner-retry-reload"'));
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return { json: async () => ({}) }; };
  try {
    slots.get('shell-banner-slot').querySelector('#shell-banner-retry-reload').click();
    await sleep(5);
  } finally { delete globalThis.fetch; }
  assert.equal(calls[0].url, '/api/reload');
  assert.equal(calls[0].options.method, 'POST');
  uninstallDom();
}

// Clicking the X posts {source, id} to the dismiss route and re-checks; the
// row leaves only when the daemon stops reporting it (no optimistic clear).
{
  let errors = [HELD];
  const { app, banner, slots } = makeApp(async () => ({ reachable: true, state: 'running', errors, paused: false }));
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { json: async () => ({ succeeded: true, dismissed: true }) };
  };
  try {
    slots.get('shell-banner-slot').querySelector('#shell-banner-dismiss-reload').click();
    await sleep(5);
    assert.equal(calls[0].url, '/api/state/dismiss');
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body), { source: 'reload', id: 7 });
    assert.ok(banner().includes('bridge unreachable'), 'daemon still holds it: row stays');
    errors = [];
    await app.checkNow();
    assert.equal(banner(), '', 'row gone once the daemon cleared it');
  } finally { delete globalThis.fetch; }
  uninstallDom();
}

// No X unless the host is running (Dismiss rule, decision 1): a failed host
// and a paused host with a failed resume keep their rows undismissable, and
// the saved-not-applied copy is for a running host only.
{
  for (const [state, source] of [['failed', 'startup'], ['failed', 'reload'], ['paused', 'resume']]) {
    const { app, banner } = makeApp(stateOk({ state, paused: state === 'paused', errors: [{ source, message: 'boom', id: 3 }] }));
    app.navigate(blankScreen(), 'dashboard');
    await app._pollOnce();
    assert.ok(banner().includes('boom'));
    assert.ok(!banner().includes('shell-banner-dismiss'), `no X for ${state}/${source}`);
    assert.ok(!banner().includes('Saved, but'), `no saved-not-applied copy for ${state}/${source}`);
    uninstallDom();
  }
}

// A permission row on a running host gets the X too (and still Retry only).
{
  const { app, banner } = makeApp(stateOk({ errors: [{ source: 'reload', message: 'permission_denied: no displays', id: 9 }] }));
  app.platform = 'mac';
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  assert.ok(banner().includes('Screen Recording is off'));
  assert.ok(banner().includes('id="shell-banner-dismiss-reload"'));
  assert.ok(banner().includes('id="shell-banner-retry-reload"'));
  uninstallDom();
}

// The daemon-pushed audio_permission row (Aurora-h457): short audio copy with
// Retry (the generic /api/reload, which rebuilds the grabber), Open Settings
// and an X.
{
  const { app, banner } = makeApp(stateOk({ errors: [{ source: 'audio_permission', message: 'x', id: 4 }] }));
  app.platform = 'mac';
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  assert.ok(banner().includes("System Audio Recording Only"), 'renders the audio permission block');
  assert.ok(banner().includes('Open Settings'));
  assert.ok(banner().includes('id="shell-banner-dismiss-audio_permission"'), 'dismissible');
  assert.ok(banner().includes('id="shell-banner-retry-audio_permission"'), 'Retry button');
  uninstallDom();
}

// Retry on the audio row selects Audio (the shared mode save) and then
// reloads, so a pipeline already in audio mode is still rebuilt.
{
  const { app } = makeApp(stateOk({ errors: [{ source: 'audio_permission', message: 'x', id: 4 }] }));
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push([url, options?.method ?? 'GET']);
    return { json: async () => (url === '/api/capabilities' ? { inputs: ['mac'], audioInputs: ['mac-audio'] } : { succeeded: true }) };
  };
  try { await app._retry('audio_permission'); } finally { globalThis.fetch = realFetch; }
  assert.ok(calls.some(([url, method]) => url === '/api/config' && method === 'PUT'), 'saves the audio mode');
  // The save alone does not rebuild a pipeline already in this mode, so the
  // reload follows the save.
  const putAt = calls.findIndex(([url, method]) => url === '/api/config' && method === 'PUT');
  const reloadAt = calls.findIndex(([url]) => url === '/api/reload');
  assert.ok(reloadAt > putAt && putAt >= 0, 'reload after the save');
  uninstallDom();
}

// A Mac Screen Recording permission row's Retry selects Video; a failed
// resume keeps PUT /api/state; other rows keep the plain reload.
{
  const run = async (source, message) => {
    const { app } = makeApp(stateOk({ errors: [] }));
    app.platform = 'mac';
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      calls.push([url, options?.method ?? 'GET', options?.body]);
      return { json: async () => (url === '/api/capabilities' ? { inputs: ['mac'], audioInputs: ['mac-audio'] } : { succeeded: true }) };
    };
    try { await app._retry(source, message); } finally { globalThis.fetch = realFetch; }
    uninstallDom();
    return calls;
  };
  const video = await run('reload', 'permission_denied: no displays');
  const put = video.find(([url, method]) => url === '/api/config' && method === 'PUT');
  assert.equal(JSON.parse(put[2]).activeInputName, 'mac', 'selects Video');
  assert.ok(video.some(([url]) => url === '/api/reload'));
  const resume = await run('resume', 'permission_denied: no displays');
  assert.ok(resume.some(([url, method]) => url === '/api/state' && method === 'PUT'), 'resume keeps its own retry');
  const plain = await run('reload', 'boom');
  assert.ok(!plain.some(([url]) => url === '/api/config'), 'non-permission rows just reload');
}

// Daemon unreachable owns the whole screen: the takeover clears the banner
// rather than showing it alongside stale errors.
{
  let fail = false;
  const { app, banner, overlay } = makeApp(async () => {
    if (fail) throw new Error('down');
    return { reachable: true, state: 'failed', errors: [{ source: 'startup', message: 'boom' }] };
  });
  await app._pollOnce();
  assert.ok(banner().includes('boom'));
  fail = true;
  await app._pollOnce();
  await app._pollOnce();
  assert.equal(banner(), '', 'banner cleared once the takeover owns the screen');
  assert.ok(overlay().includes('Aurora has stopped'));
  uninstallDom();
}

console.log('shell checks passed.');
