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
  return { app, slots, recovered, overlay };
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

console.log('shell checks passed.');
