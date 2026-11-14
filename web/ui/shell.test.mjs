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
const realFetchForPairing = globalThis.fetch;
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
  const banner = () => app._bannerHtml();
  return { app, slots, recovered, overlay, banner };
}

// Presses the banner button with this id the way the page's delegated handler does:
// _act(data-action, data-key), the key read off the drawn row that holds the button.
function press(app, action, id) {
  const row = app._rows.find((candidate) => candidate.html.includes(`id="${id}"`));
  assert.ok(row, `a drawn row holds #${id}`);
  return app._act(action, row.key);
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
  assert.ok(!banner().includes('1 error'), 'a lone error starts open');
  assert.ok(banner().includes('aria-expanded="true"') && banner().includes('Show less'), 'with the toggle, so it can collapse');
  uninstallDom();
}

// A failed effect switch: the message already names the effect, and Retry
// shows only when the error says a retry can help (Aurora-kep2.4).
{
  const message = "Couldn't start Fire: graph needs an audio input but none is configured";
  const { app, banner } = makeApp(stateOk({ state: 'failed', errors: [{ source: 'effect', message, retry: false }] }));
  await app._pollOnce();
  assert.ok(banner().includes(message), 'no prefix on an effect row');
  assert.ok(!banner().includes("Couldn't start: "));
  assert.ok(!banner().includes('shell-banner-retry-effect'), 'no Retry when it cannot help');
  uninstallDom();
}
{
  const { app, banner } = makeApp(stateOk({ state: 'failed', errors: [{ source: 'effect', message: "Couldn't start Fire: busy", retry: true }] }));
  await app._pollOnce();
  assert.ok(banner().includes('id="shell-banner-retry-effect"'));
  uninstallDom();
}

// Two or more start collapsed (the first reply is the baseline); expanding shows every row, each
// with its own source-keyed Retry button.
{
  const errors = [
    { source: 'startup', message: 'No outputs available' },
    { source: 'resume', message: 'bridge unreachable' },
  ];
  const { app, banner, slots } = makeApp(stateOk({ state: 'failed', errors }));
  await app._pollOnce();
  assert.ok(banner().includes('2 errors'), 'collapsed bar');
  assert.ok(banner().includes('aria-expanded="false"'));
  assert.ok(!banner().includes('No outputs available'), 'rows hidden while collapsed');
  press(app, 'toggle', 'shell-banner-toggle');
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
    press(app, 'retry', 'shell-banner-retry-startup');
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
    press(app, 'retry', 'shell-banner-retry-resume');
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
// paired" failure -- hidden on the pairing routes, shown from Mode+Device on
// (Aurora-scig; ErrorOverlay.md's onboarding-gate note).
{
  const blankScreen = () => ({ mount() {}, unmount() {} });
  const { app, banner } = makeApp(stateOk({ state: 'failed', errors: [{ source: 'reload', message: 'No outputs available' }] }));
  for (const route of ['welcome', 'mac-tip', 'output-connect', 'output-select']) {
    app.navigate(blankScreen(), route);
    await app._pollOnce();
    assert.equal(banner(), '', `reload error gated on ${route}`);
  }
  app.navigate(blankScreen(), 'mode-device');
  await app._pollOnce();
  assert.ok(banner().includes("Couldn't apply settings: No outputs available"), 'reload error shown on Capture Source');
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

// A dismissed Linux screen-share dialog reads as plain copy, no portal text.
{
  const declined = { source: 'reload', message: 'screen_share_declined: Start cancelled by the user', id: 8 };
  const { app, banner } = makeApp(stateOk({ errors: [declined] }));
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  assert.ok(banner().includes("Saved, but couldn't apply: Screen sharing was declined. Aurora is still"));
  // The row's key holds the raw message (data-key); only the shown text is reworded.
  const shown = banner().replace(/ data-key="[^"]*"/g, '');
  assert.ok(!shown.includes('cancelled by the user'));
  assert.ok(!shown.includes('screen_share_declined'));
}

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
    press(app, 'retry', 'shell-banner-retry-reload');
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
    press(app, 'dismiss', 'shell-banner-dismiss-reload');
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
  assert.ok(banner().includes("Aurora can't hear any audio."), 'renders the audio permission block');
  assert.ok(banner().includes('Open Settings'));
  assert.ok(banner().includes('id="shell-banner-dismiss-audio_permission"'), 'dismissible');
  assert.ok(banner().includes('id="shell-banner-retry-audio_permission"'), 'Retry button');
  uninstallDom();
}

// Retry on the audio row is the generic rebuild: POST /api/reload.
{
  const { app } = makeApp(stateOk({ errors: [{ source: 'audio_permission', message: 'x', id: 4 }] }));
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => { calls.push([url, options?.method ?? 'GET']); return { json: async () => ({}) }; };
  try { await app._retry('audio_permission'); } finally { globalThis.fetch = realFetch; }
  assert.ok(calls.some(([url, method]) => url === '/api/reload' && method === 'POST'), 'reloads');
  uninstallDom();
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

// Host conditions (Aurora-rbp3): a standing fact renders on any route,
// including first-run screens while the host is idle, with no Retry or X.
{
  const { app, banner } = makeApp(stateOk({ state: 'idle', conditions: [{ source: 'local_network', message: 'blocked' }] }));
  app.navigate(blankScreen(), 'output-connect');
  await app._pollOnce();
  assert.ok(banner().includes("Aurora can't reach devices on your network"), 'local network row on a NUX route');
  assert.ok(banner().includes('com.apple.preference.security'), 'Open Settings link');
  assert.ok(!banner().includes('shell-banner-retry'), 'no Retry on a condition');
  assert.ok(!banner().includes('shell-banner-dismiss'), 'no X on a condition');
  uninstallDom();
}

// An unknown condition source still shows its message, escaped.
{
  const { app, banner } = makeApp(stateOk({ conditions: [{ source: 'future_thing', message: '<b>x</b>' }] }));
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  assert.ok(banner().includes('&lt;b&gt;x&lt;/b&gt;'), 'generic, escaped');
  uninstallDom();
}

// A condition plus an error collapse together as "2 errors"; the
// condition clears from the banner once the daemon drops it.
{
  let conditions = [{ source: 'local_network', message: 'blocked' }];
  const { app, banner } = makeApp(async () => ({ reachable: true, state: 'running', paused: false, errors: [{ source: 'reload', message: 'boom', id: 1 }], conditions }));
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  assert.ok(banner().includes('2 errors'), 'counts conditions and errors together');
  conditions = [];
  await app._pollOnce();
  assert.ok(!banner().includes('2 errors') && !banner().includes('1 error'), 'one row left: open, not the count bar');
  assert.ok(!banner().includes('reach devices'), 'condition row gone');
  uninstallDom();
}

// An absent conditions field (older daemon, demo shim) is the same as none.
{
  const { app, banner } = makeApp(stateOk());
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  assert.equal(banner(), '');
  uninstallDom();
}

// Pairing requests (Aurora-5ipy.6): polled only while this browser can
// approve, shown with name and code above any problem. Since Aurora-9hqa.4 they are notices inside
// the collapse: a request that arrives re-opens the shell, one pending at load is baseline.
{
  const pendingCalls = [];
  const fetchPending = async () => { pendingCalls.push(1); return [{ ref: 'r1', name: '<Phone>', scope: 'admin', code: 'K7Q2X' }]; };
  const { app, banner } = makeApp(async () => ({ reachable: true, state: 'running', errors: [{ source: 'reload', message: 'a', id: 1 }, { source: 'startup', message: 'b', id: 2 }] }), { fetchPending });
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  await sleep(0);
  assert.equal(pendingCalls.length, 0, 'not polled without canApprove');
  app.canApprove = true;
  await app._pollOnce();
  await sleep(0);
  assert.equal(pendingCalls.length, 1, 'polled with the beat');
  assert.ok(banner().includes('&lt;Phone&gt;'), 'name escaped');
  assert.ok(banner().includes('K7Q2X'), 'code shown');
  assert.ok(banner().includes('shell-pairing-approve-r1') && banner().includes('shell-pairing-deny-r1'), 'approve and deny');
  assert.ok(!banner().includes('2 errors') && banner().includes('aria-expanded="true"'), 'a request that arrives re-opens the collapsed shell');
  assert.ok(banner().indexOf('K7Q2X') < banner().indexOf('shell-banner-toggle'), 'the request is a row above the toggle');
  assert.ok(banner().includes('shell-pairing-title"><span class="shell-mark shell-mark-info"'), 'a notice: circled-info');
  assert.ok(!banner().includes('Access:'), 'a browser (admin) request has no access line');
  assert.ok(banner().includes('Device:</span> &lt;Phone&gt;') && !banner().includes('From:'), 'no From line without an address');
  press(app, 'toggle', 'shell-banner-toggle');
  assert.ok(banner().includes('1 notice') && banner().includes('2 errors') && !banner().includes('K7Q2X'), 'collapsed: the request counts as a notice');
  uninstallDom();
}

// The baseline waits for the first pending result (Aurora-9hqa.4), so requests already pending at
// load are baseline: 2+ rows start collapsed and nothing reads as an arrival.
{
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fetchPending = async () => { await gate; return [{ ref: 'r1', name: 'Phone', scope: 'admin', code: 'K7Q2X' }]; };
  const { app, banner } = makeApp(stateOk({ errors: [{ source: 'reload', message: 'a', id: 1 }] }), { fetchPending });
  app.canApprove = null; // app.js: /api/pairing/status not read yet
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  assert.equal(banner(), '', 'nothing is drawn while canApprove is unknown');
  app.setCanApprove(true);
  await sleep(0);
  assert.equal(banner(), '', 'nor while the first pending result is out');
  release();
  await sleep(0);
  await sleep(0);
  assert.ok(banner().includes('1 notice') && banner().includes('1 error') && banner().includes('aria-expanded="false"'), 'a pending request at load starts collapsed with the error');
  assert.ok(!banner().includes('K7Q2X'));
  await app._pollOnce();
  await sleep(0);
  assert.ok(banner().includes('aria-expanded="false"'), 'the next poll does not re-open');
  // Recovery takes a new baseline the same way.
  app._showTakeover('unreachable');
  assert.equal(app._baselined, false);
  await app._pollOnce();
  await sleep(0);
  await sleep(0);
  assert.ok(banner().includes('aria-expanded="false"') && banner().includes('1 notice'), 'after recovery the pending request is baseline again');
  uninstallDom();
}

// A browser that cannot approve has no pending result to wait for; a failed first read does not hold the shell back.
{
  const { app, banner } = makeApp(stateOk({ errors: [{ source: 'reload', message: 'a', id: 1 }, { source: 'startup', message: 'b', id: 2 }] }));
  app.canApprove = null;
  app.currentRouteId = 'dashboard';
  await app._pollOnce();
  assert.equal(banner(), '');
  app.setCanApprove(false);
  assert.ok(banner().includes('2 errors'), 'canApprove false: the baseline is taken at once');
  uninstallDom();
  const failing = makeApp(stateOk({ errors: [{ source: 'reload', message: 'a', id: 1 }] }), { fetchPending: async () => { throw new Error('boom'); } });
  failing.app.canApprove = true;
  failing.app.currentRouteId = 'dashboard';
  await failing.app._pollOnce();
  await sleep(0);
  assert.ok(failing.banner().includes('shell-banner-row'), 'a failed pending read still lets the shell draw');
  uninstallDom();
}

// An agent token request (aurora-mcp --pair) names its access in the banner.
{
  const fetchPending = async () => [{ ref: 'r1', name: 'aurora-mcp on laptop', scope: 'apply', code: 'K7Q2X', from: '192.168.0.51' }];
  const { app, banner } = makeApp(ok(), { fetchPending });
  app.canApprove = true;
  await app._pollOnce();
  await sleep(0);
  assert.ok(banner().includes('Device:</span> aurora-mcp on laptop</li>'));
  assert.ok(banner().includes('From:</span> 192.168.0.51</li>'));
  assert.ok(banner().includes('Access:</span> Apply. Change effects and test on the lights, not settings.</li>'));
  assert.ok(banner().includes('Approve only if the device shows the same code.'));
  uninstallDom();
}

// Approve POSTs, re-reads pending and tells the Dashboard; a deny does not.
{
  let pending = [{ ref: 'r1', name: 'Phone', scope: 'admin', code: 'K7Q2X' }];
  const { app, slots, banner } = makeApp(ok(), { fetchPending: async () => pending });
  app.canApprove = true;
  let changed = 0;
  app.onPairedDevicesChanged = () => { changed++; };
  await app._pollOnce();
  await sleep(0);
  const posts = [];
  globalThis.fetch = async (url, init) => { posts.push([url, init?.method]); pending = []; return { ok: true, status: 200 }; };
  press(app, 'approve', 'shell-pairing-approve-r1');
  await sleep(0);
  await sleep(0);
  assert.deepEqual(posts, [['/api/pairing/pending/r1/approve', 'POST']]);
  assert.equal(banner(), '', 'row gone once the daemon drops it');
  assert.equal(changed, 1, 'device list refresh');

  pending = [{ ref: 'r2', name: 'Tablet', scope: 'admin', code: 'ABCDE' }];
  await app._pollOnce();
  await sleep(0);
  press(app, 'deny', 'shell-pairing-deny-r2');
  await sleep(0);
  await sleep(0);
  assert.deepEqual(posts.at(-1), ['/api/pairing/pending/r2/deny', 'POST']);
  assert.equal(changed, 1, 'deny adds no device');
  globalThis.fetch = realFetchForPairing;
  uninstallDom();
}

// Rows run the light test, pairing requests, then conditions as sent, then
// errors newest id first; every button names its action and its row's key (Aurora-9hqa.1).
{
  const { app, banner } = makeApp(stateOk({
    errors: [{ source: 'startup', message: 'old', id: 2 }, { source: 'reload', message: 'new', id: 9 }],
    conditions: [{ source: 'other', message: 'cond' }],
    test: { active: true, confirmRemainingMs: null, holder: { session: 's', client: null } },
  }), { fetchPending: async () => [{ ref: 'r1', name: 'Phone', code: 'K7Q2X' }] });
  app.canApprove = true;
  app.currentRouteId = 'dashboard';
  app._baselined = true; // skip the baseline: start open
  await app._pollOnce();
  await sleep(0);
  assert.deepEqual(app._rows.map((row) => row.kind), ['light-test', 'pairing', 'condition', 'error', 'error', 'toggle']);
  assert.deepEqual(app._rows.filter((row) => row.kind === 'error').map((row) => row.error.message), ['new', 'old']);
  assert.ok(/data-action="stop-test" data-key="test:s:live"/.test(banner()), 'buttons carry data-action and data-key');
  assert.ok(banner().includes('data-action="approve" data-key="pairing:r1"'));
  assert.equal(await app._act('retry', 'no-such-key'), undefined, 'an unknown key does nothing');
  app._stopLightTestTimer();
  uninstallDom();
}

// The takeover drops pending rows with everything else.
{
  let fail = false;
  const { app, banner } = makeApp(async () => { if (fail) throw new Error('down'); return { reachable: true }; }, { fetchPending: async () => [{ ref: 'r1', name: 'Phone', code: 'K7Q2X' }] });
  app.canApprove = true;
  await app._pollOnce();
  await sleep(0);
  assert.ok(banner().includes('K7Q2X'));
  fail = true;
  await app._pollOnce();
  await app._pollOnce();
  assert.equal(banner(), '');
  assert.deepEqual(app.pendingPairings, []);
  uninstallDom();
}

// Light test row (Aurora-exbp): from the poll's test field, above problems,
// counts down locally, Stop test POSTs, no Keep.
{
  let test = { active: true, confirmRemainingMs: 100000, holder: { session: 'agent-1', client: 'mcp' } };
  const { app, slots, banner } = makeApp(async () => ({ reachable: true, state: 'running', errors: [{ source: 'reload', message: 'a', id: 1 }], test }));
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  press(app, 'toggle', 'shell-banner-toggle'); // two rows start collapsed
  assert.ok(banner().includes('An agent is testing an effect on the lights. Will revert in:'), 'row shown, names the agent');
  assert.ok(banner().includes('1:40'), 'clock from confirmRemainingMs');
  assert.ok(banner().indexOf('shell-light-test-stop') < banner().indexOf('shell-banner-retry-reload'), 'above problems');
  assert.ok(!/Keep/.test(banner()), 'no Keep');
  app.lightTestEndsAt -= 61000;
  assert.equal(app._lightTestClock(), '0:39', 'counts down between polls');
  const posts = [];
  globalThis.fetch = async (url, init) => { posts.push([url, init?.method]); test = { active: false, confirmRemainingMs: 0 }; return { ok: true, status: 200 }; };
  press(app, 'stop-test', 'shell-light-test-stop');
  await sleep(0);
  await sleep(0);
  assert.deepEqual(posts, [['/api/graph/test/stop', 'POST']]);
  assert.ok(!banner().includes('shell-light-test-stop'), 'row gone once the poll says inactive');
  assert.equal(app._lightTestTimer, null, 'tick timer cleared');
  globalThis.fetch = realFetchForPairing;
  uninstallDom();
}

// A live test (confirmRemainingMs null) shows the row without a countdown.
{
  const { app, banner } = makeApp(async () => ({ reachable: true, test: { active: true, mode: 'live', confirmRemainingMs: null, holder: { session: 'editor-1', client: null } } }));
  await app._pollOnce();
  assert.ok(banner().includes('Another editor tab or window is testing an effect on the lights.'), 'row shown, names the editor tab');
  assert.ok(banner().includes('shell-light-test-stop'), 'Stop test offered');
  assert.ok(!banner().includes('Will revert in') && !banner().includes('shell-light-test-time'), 'no countdown');
  assert.equal(app.lightTestEndsAt, null);
  uninstallDom();
}

// No holder in the answer still reads as a sentence.
{
  const { app, banner } = makeApp(async () => ({ reachable: true, test: { active: true, confirmRemainingMs: 5000 } }));
  await app._pollOnce();
  assert.ok(banner().includes('Another session is testing an effect on the lights.'), 'unknown holder');
  uninstallDom();
}

// A test alone shows the banner; the takeover drops it.
{
  let fail = false;
  const { app, banner } = makeApp(async () => { if (fail) throw new Error('down'); return { reachable: true, test: { active: true, confirmRemainingMs: 5000 } }; });
  await app._pollOnce();
  assert.ok(banner().includes('shell-light-test-stop'));
  fail = true;
  await app._pollOnce();
  await app._pollOnce();
  assert.equal(banner(), '');
  assert.equal(app.lightTestEndsAt, null);
  uninstallDom();
}

// Collapse state (Aurora-u8jx.5): a snapshot of the row keys, memory only.
{
  const err = (source, message, id) => ({ source, message, id });
  let errors = [err('reload', 'a', 1), err('startup', 'b', 2)];
  let test = { active: false };
  const { app, banner } = makeApp(async () => ({ reachable: true, state: 'running', paused: false, errors, test }));
  app.navigate(blankScreen(), 'dashboard');
  assert.equal(banner(), '', 'nothing before the first reply');
  await app._pollOnce();
  assert.ok(banner().includes('2 errors') && !banner().includes('shell-banner-retry'), 'baseline: 2 rows start collapsed');
  // A poll with the same rows leaves it collapsed.
  await app._pollOnce();
  assert.ok(banner().includes('2 errors'));
  // An arrival re-opens, and it stays open when the arrival leaves.
  errors = [...errors, err('resume', 'c', 3)];
  await app._pollOnce();
  assert.ok(banner().includes('shell-banner-retry-resume') && banner().includes('Show less'), 'a new row re-opens');
  errors = errors.slice(0, 2);
  await app._pollOnce();
  assert.ok(banner().includes('Show less'), 'stays open once re-opened');
  // The user collapses: the snapshot is the keys on screen. A changed message re-opens.
  press(app, 'toggle', 'shell-banner-toggle');
  assert.ok(banner().includes('2 errors'));
  errors = [err('reload', 'a changed', 1), errors[1]];
  await app._pollOnce();
  assert.ok(banner().includes('a changed') && banner().includes('Show less'), 'a changed message re-opens');
  // A light test joins the collapse and counts as a notice; its countdown never re-opens.
  press(app, 'toggle', 'shell-banner-toggle');
  test = { active: true, confirmRemainingMs: 90000, holder: { session: 'a', client: 'mcp' } };
  await app._pollOnce();
  assert.ok(banner().includes('Show less') && banner().includes('shell-light-test-stop'), 'the test row arrives open');
  press(app, 'toggle', 'shell-banner-toggle');
  assert.ok(banner().includes('1 notice') && banner().includes('2 errors') && !banner().includes('shell-light-test-stop'));
  test = { active: true, confirmRemainingMs: 60000, holder: { session: 'a', client: 'mcp' } };
  await app._pollOnce();
  assert.ok(banner().includes('1 notice'), 'a ticking countdown stays collapsed');
  // Rows clearing reset: a lone row afterwards is open, and can be collapsed.
  errors = [];
  test = { active: false };
  await app._pollOnce();
  assert.equal(banner(), '');
  errors = [err('reload', 'a', 1), err('startup', 'b', 2)];
  await app._pollOnce();
  assert.ok(banner().includes('Show less'), 'after clearing, new rows arrive open (the baseline is only the first reply)');
  errors = [errors[0]];
  await app._pollOnce();
  press(app, 'toggle', 'shell-banner-toggle');
  assert.ok(banner().includes('1 error') && !banner().includes('shell-banner-retry'), 'a lone row can collapse');
  press(app, 'toggle', 'shell-banner-toggle');
  assert.ok(banner().includes('shell-banner-retry-reload'));
  app._stopLightTestTimer();
  uninstallDom();
}

// Recovery from the takeover is a new baseline: 2+ rows start collapsed, a lone row open.
{
  let fail = false;
  let errors = [{ source: 'reload', message: 'a', id: 1 }, { source: 'startup', message: 'b', id: 2 }];
  const { app, banner } = makeApp(async () => { if (fail) throw new Error('down'); return { reachable: true, state: 'running', errors }; });
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  press(app, 'toggle', 'shell-banner-toggle');
  assert.ok(banner().includes('Show less'));
  fail = true;
  await app._pollOnce();
  await app._pollOnce();
  assert.equal(banner(), '');
  fail = false;
  await app._pollOnce();
  assert.ok(banner().includes('2 errors') && !banner().includes('Show less'), 'recovery re-baselines: collapsed again');
  fail = true;
  await app._pollOnce();
  await app._pollOnce();
  fail = false;
  errors = [errors[0]];
  await app._pollOnce();
  assert.ok(banner().includes('Show less') && banner().includes('shell-banner-retry-reload'), 'a lone row after recovery is open');
  uninstallDom();
}

// ---- Arrival spotlight (Aurora-9hqa.2) ----
// The rows that are new this render (isNew, which the page draws as data-new) and the one polite
// announcement. Nothing at the baseline, on a poll that changes nothing or only the countdown, or on
// the first reply after the takeover; an arrival, a changed message and a pairing request do.
{
  let errors = [{ source: 'reload', message: 'a', id: 1 }];
  let test = { active: false };
  const { app, slots } = makeApp(async () => ({ reachable: true, state: 'running', errors, test }));
  const fresh = () => app._rows.filter((row) => row.isNew).map((row) => row.key);
  const said = async () => { await sleep(120); return slots.get('shell-announcer').textContent; };
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  assert.deepEqual(fresh(), [], 'the baseline: nothing is new');
  assert.equal(await said(), undefined, 'and nothing is announced');
  await app._pollOnce();
  assert.deepEqual(fresh(), [], 'a poll that changes nothing');
  // An arrival: the folded-or-open state is irrelevant, only the new key pulses; one announcement.
  errors = [{ source: 'reload', message: 'a', id: 1 }, { source: 'startup', message: 'b', id: 2 }];
  await app._pollOnce();
  assert.deepEqual(fresh(), ['error:startup:b'], 'only the new row pulses; the row already there does not');
  assert.equal(await said(), "Couldn't start: b");
  assert.ok(app._rows.some((row) => row.kind === 'toggle' && !row.collapsed) && !fresh().includes('toggle'), 'open, and the toggle never pulses');
  // Re-opening from the collapse: the arrival opens it in the same render and rows already there stay still.
  press(app, 'toggle', 'shell-banner-toggle');
  assert.ok(app._rows.length === 1 && app._rows[0].collapsed, 'collapsed');
  await app._pollOnce();
  assert.deepEqual(fresh(), [], 'a poll while collapsed with nothing new does not pulse');
  errors = [...errors, { source: 'resume', message: 'c', id: 3 }];
  await app._pollOnce();
  assert.ok(app._rows.length === 4 && !app._rows.at(-1).collapsed, 'the arrival re-opened the shell');
  assert.deepEqual(fresh(), ['error:resume:c'], 'in that render only the arrival pulses');
  assert.equal(await said(), "Couldn't resume: c");
  // A changed message is a new key.
  errors = errors.map((e) => (e.source === 'resume' ? { ...e, message: 'd' } : e));
  await app._pollOnce();
  assert.deepEqual(fresh(), ['error:resume:d']);
  assert.equal(await said(), "Couldn't resume: d");
  // The light test: announced once when its key arrives, never for the countdown.
  test = { active: true, confirmRemainingMs: 90_000, holder: { session: 'x', client: 'mcp' } };
  await app._pollOnce();
  assert.deepEqual(fresh(), ['test:x:once']);
  assert.equal(await said(), 'An agent is testing an effect on the lights.');
  slots.get('shell-announcer').textContent = 'cleared';
  test = { active: true, confirmRemainingMs: 60_000, holder: { session: 'x', client: 'mcp' } };
  await app._pollOnce();
  assert.deepEqual(fresh(), [], 'the countdown is not an arrival');
  assert.equal(await said(), 'cleared', 'and says nothing');
  app._stopLightTestTimer();
  uninstallDom();
}

// Two arrivals in one poll are one announcement, in drawn order.
{
  let errors = [];
  const { app, slots } = makeApp(async () => ({ reachable: true, state: 'running', errors }));
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  errors = [{ source: 'startup', message: 'one', id: 1 }, { source: 'resume', message: 'two', id: 2 }];
  await app._pollOnce();
  await sleep(120);
  assert.equal(slots.get('shell-announcer').textContent, "Couldn't resume: two Couldn't start: one", 'newest first, joined');
  uninstallDom();
}

// A request already pending at load is baseline; one that arrives later pulses and is announced.
{
  let pending = [{ ref: 'r1', name: 'Old phone', scope: 'read', code: 'AAAAA' }];
  const { app, slots } = makeApp(ok(), { fetchPending: async () => pending });
  app.setCanApprove(true);
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  await sleep(20);
  assert.deepEqual(app._rows.filter((row) => row.isNew), [], 'pending at load: baseline');
  assert.equal(slots.get('shell-announcer').textContent, undefined);
  pending = [...pending, { ref: 'r2', name: 'New tablet', scope: 'read', code: 'BBBBB' }];
  await app._refreshPending();
  assert.deepEqual(app._rows.filter((row) => row.isNew).map((row) => row.key), ['pairing:r2']);
  await sleep(120);
  assert.equal(slots.get('shell-announcer').textContent, 'Pair a device with Aurora? New tablet.');
  uninstallDom();
}

// Recovery from the takeover is a new baseline: what is there then is not an arrival.
{
  let fail = false;
  const errors = [{ source: 'reload', message: 'a', id: 1 }];
  const { app, slots } = makeApp(async () => { if (fail) throw new Error('down'); return { reachable: true, state: 'running', errors }; });
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  fail = true;
  await app._pollOnce();
  await app._pollOnce();
  fail = false;
  await app._pollOnce();
  await sleep(120);
  assert.deepEqual(app._rows.filter((row) => row.isNew), []);
  assert.equal(slots.get('shell-announcer').textContent, undefined);
  uninstallDom();
}

// Dev-only cadence (AURORA_DEV_POLL_MS on the app): a reply's devPollMs speeds the beat up, never slows it,
// and a reply without it (every release app) leaves the interval alone.
{
  const reply = { reachable: true, state: 'running', errors: [] };
  const { app } = makeApp(async () => reply, { pollIntervalMs: 3000 });
  await app._pollOnce();
  assert.equal(app._pollIntervalMs, 3000, 'no devPollMs: unchanged');
  reply.devPollMs = 300;
  await app._pollOnce();
  assert.equal(app._pollIntervalMs, 300, 'devPollMs sets the cadence');
  reply.devPollMs = 5000;
  await app._pollOnce();
  assert.equal(app._pollIntervalMs, 300, 'never slower than the current one');
  reply.devPollMs = 'x';
  await app._pollOnce();
  assert.equal(app._pollIntervalMs, 300, 'junk ignored');
  uninstallDom();
}

console.log('shell checks passed.');
