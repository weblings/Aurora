// App shell connection watcher (Aurora-ewyz, single-variant takeover
// Aurora-yzp4): the beat takes `failureThreshold` consecutive failed polls
// to raise the heading-only 'Aurora has stopped' takeover (one blip never
// shows), recovery calls onRecovered once with the preserved route,
// confirmed Stop keeps the same overlay and keeps polling until the daemon
// answers, and concurrent checkNow() triggers share one poll. The error shell
// itself is a React island (Aurora-4nqt.4): these tests read the props the shell
// pushes to it. No DOM needed -- document, island and fetchStatus doubles, real
// timers with tiny intervals. Run with `node shell.test.mjs`.
import assert from 'node:assert/strict';
import { App } from './shell.js';

function makeSlot() {
  return { innerHTML: '' };
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
  delete globalThis.auroraIslands;
}

// The island double: keeps the props the shell last pushed (mount, then every update).
function makeApp(fetchStatus, opts = {}) {
  const slots = installDom();
  const history = [];
  let mounted = 0;
  globalThis.auroraIslands = {
    mountErrorShell: (el, props) => {
      assert.equal(el, slots.get('shell-island'), 'mounted into #shell-island');
      mounted++;
      history.push(props);
      return { update: (next) => history.push(next), unmount() {} };
    },
  };
  const recovered = [];
  const app = new App({
    fetchStatus,
    pollIntervalMs: 100000,
    abortTimeoutMs: 50,
    ...opts,
  });
  assert.equal(mounted, 1, 'the island is mounted once');
  app.onRecovered = (id) => recovered.push(id);
  const props = () => history.at(-1);
  const overlay = () => (props().unreachable ? 'Aurora has stopped' : '');
  return { app, slots, recovered, overlay, props, history };
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
// The shell feeds facts to the island, which owns the rows, their order, the collapse, the pulses and
// the words (ErrorShell.test.tsx). These read what the shell pushes.

const stateOk = (extra = {}) => async () => ({ reachable: true, state: 'running', errors: [], paused: false, ...extra });
const settle = async () => { await sleep(0); await sleep(0); };
const withFetch = async (stub, run) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    await run();
  } finally {
    globalThis.fetch = realFetch;
  }
};

// Nothing is drawn before the first reply: hasReplied holds the island back.
{
  const { app, props } = makeApp(stateOk());
  assert.equal(props().hasReplied, false, 'before any reply');
  assert.equal(props().unreachable, false);
  app.canApprove = false;
  await app._pollOnce();
  assert.equal(props().hasReplied, true);
  assert.deepEqual([props().errors, props().conditions, props().pairings, props().lightTest], [[], [], [], null]);
  assert.equal(props().hostState, 'running');
  uninstallDom();
}

// The poll's own fields reach the island: errors, conditions, host state and platform.
{
  const errors = [{ source: 'startup', message: 'No outputs available' }, { source: 'effect', message: "Couldn't start Fire: busy", retry: false }];
  const conditions = [{ source: 'local_network', message: 'x' }];
  const { app, props } = makeApp(stateOk({ state: 'failed', errors, conditions }));
  app.platform = 'mac';
  await app._pollOnce();
  assert.deepEqual(props().errors, errors);
  assert.deepEqual(props().conditions, conditions);
  assert.equal(props().hostState, 'failed');
  assert.equal(props().platform, 'mac');
  uninstallDom();
}

// An absent conditions field (older daemon, demo shim) is the same as none.
{
  const { app, props } = makeApp(async () => ({ reachable: true, state: 'running', errors: [] }));
  await app._pollOnce();
  assert.deepEqual(props().conditions, []);
  uninstallDom();
}

// Retry: a failed-host source posts /api/reload; a failed-resume source
// PUTs /api/state {running:true}. Either way it re-checks afterward.
{
  const calls = [];
  await withFetch(async (url, options) => {
    calls.push({ url, options });
    return { status: 200, json: async () => ({ succeeded: true }) };
  }, async () => {
    const { app, props } = makeApp(stateOk({ state: 'failed', errors: [{ source: 'startup', message: 'boom' }] }));
    await app._pollOnce();
    props().onRetry('startup');
    await settle();
    assert.equal(calls[0].url, '/api/reload');
    assert.equal(calls[0].options.method, 'POST');
    props().onRetry('resume');
    await settle();
    assert.equal(calls[1].url, '/api/state');
    assert.equal(calls[1].options.method, 'PUT');
    assert.deepEqual(JSON.parse(calls[1].options.body), { running: true });
    uninstallDom();
  });
}

// Dismiss posts {source, id} and re-checks; the row leaves only when the daemon stops reporting it.
{
  const posts = [];
  let errors = [{ source: 'reload', message: 'a', id: 8 }];
  await withFetch(async (url, options) => {
    posts.push({ url, body: JSON.parse(options.body) });
    errors = [];
    return { status: 200, json: async () => ({}) };
  }, async () => {
    const { app, props } = makeApp(async () => ({ reachable: true, state: 'running', errors }));
    app.navigate(blankScreen(), 'dashboard');
    await app._pollOnce();
    assert.equal(props().errors.length, 1);
    props().onDismiss(props().errors[0]);
    await settle();
    assert.deepEqual(posts, [{ url: '/api/state/dismiss', body: { source: 'reload', id: 8 } }]);
    assert.deepEqual(props().errors, [], 'gone once the daemon drops it');
    uninstallDom();
  });
}

// Onboarding gate: a 'reload' source is the mid-onboarding "no outputs
// paired" failure -- hidden on the pairing routes, shown from Mode+Device on
// (Aurora-scig; ErrorOverlay.md's onboarding-gate note).
{
  const { app, props } = makeApp(stateOk({ state: 'failed', errors: [{ source: 'reload', message: 'No outputs available' }] }));
  for (const route of ['welcome', 'mac-tip', 'output-connect', 'output-select']) {
    app.navigate(blankScreen(), route);
    await app._pollOnce();
    assert.deepEqual(props().errors, [], `reload error gated on ${route}`);
  }
  for (const route of ['mode-device', 'dashboard']) {
    app.navigate(blankScreen(), route);
    await app._pollOnce();
    assert.equal(props().errors.length, 1, `reload error shown on ${route}`);
  }
  uninstallDom();
}
// A non-'reload' source is never gated, even mid-onboarding (a startup
// failure is real regardless of NUX progress).
{
  const { app, props } = makeApp(stateOk({ state: 'failed', errors: [{ source: 'startup', message: 'boom' }] }));
  app.navigate(blankScreen(), 'welcome');
  await app._pollOnce();
  assert.equal(props().errors.length, 1, 'startup error is never gated');
  uninstallDom();
}

// Daemon unreachable owns the whole screen: the takeover clears the rows
// rather than showing them alongside stale errors, and recovery draws them again.
{
  let fail = false;
  const { app, props } = makeApp(async () => {
    if (fail) throw new Error('down');
    return { reachable: true, state: 'failed', errors: [{ source: 'startup', message: 'boom' }], conditions: [{ source: 'x', message: 'c' }] };
  });
  await app._pollOnce();
  assert.equal(props().errors.length, 1);
  fail = true;
  await app._pollOnce();
  assert.equal(props().unreachable, false, 'one blip never shows the takeover');
  await app._pollOnce();
  assert.equal(props().unreachable, true);
  assert.equal(props().hasReplied, false, 'the island draws no rows under the takeover');
  assert.deepEqual([props().errors, props().conditions, props().pairings, props().lightTest, props().hostState], [[], [], [], null, null]);
  fail = false;
  await app._pollOnce();
  assert.equal(props().unreachable, false);
  assert.equal(props().hasReplied, true, 'recovery is a new baseline');
  assert.equal(props().errors.length, 1);
  uninstallDom();
}

// Pairing requests (Aurora-5ipy.6): polled only while this browser can approve.
{
  const pendingCalls = [];
  const request = { ref: 'r1', name: '<Phone>', scope: 'admin', code: 'K7Q2X' };
  const fetchPending = async () => { pendingCalls.push(1); return [request]; };
  const { app, props } = makeApp(stateOk(), { fetchPending });
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  await sleep(0);
  assert.equal(pendingCalls.length, 0, 'not polled without canApprove');
  app.canApprove = true;
  await app._pollOnce();
  await sleep(0);
  assert.equal(pendingCalls.length, 1, 'polled with the beat');
  assert.deepEqual(props().pairings, [request]);
  uninstallDom();
}

// The baseline waits for the first pending result (Aurora-9hqa.4), so requests already pending at
// load are baseline: the island is held back until canApprove and that result are in.
{
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fetchPending = async () => { await gate; return [{ ref: 'r1', name: 'Phone', scope: 'admin', code: 'K7Q2X' }]; };
  const { app, props } = makeApp(stateOk({ errors: [{ source: 'reload', message: 'a', id: 1 }] }), { fetchPending });
  app.canApprove = null; // app.js: /api/pairing/status not read yet
  app.navigate(blankScreen(), 'dashboard');
  await app._pollOnce();
  assert.equal(props().hasReplied, false, 'nothing is drawn while canApprove is unknown');
  app.setCanApprove(true);
  await sleep(0);
  assert.equal(props().hasReplied, false, 'nor while the first pending result is out');
  release();
  await settle();
  assert.equal(props().hasReplied, true);
  assert.equal(props().pairings.length, 1, 'the request arrives with the baseline');
  // Recovery takes a new baseline the same way.
  app._showTakeover('unreachable');
  assert.equal(props().hasReplied, false);
  await app._pollOnce();
  await settle();
  assert.equal(props().hasReplied, true);
  uninstallDom();
}

// A browser that cannot approve has no pending result to wait for; a failed first read does not hold the shell back.
{
  const { app, props } = makeApp(stateOk({ errors: [{ source: 'reload', message: 'a', id: 1 }, { source: 'startup', message: 'b', id: 2 }] }));
  app.canApprove = null;
  app.currentRouteId = 'dashboard';
  await app._pollOnce();
  assert.equal(props().hasReplied, false);
  app.setCanApprove(false);
  assert.equal(props().hasReplied, true, 'canApprove false: the baseline is taken at once');
  assert.equal(props().errors.length, 2);
  uninstallDom();
  const failing = makeApp(stateOk({ errors: [{ source: 'reload', message: 'a', id: 1 }] }), { fetchPending: async () => { throw new Error('boom'); } });
  failing.app.canApprove = true;
  failing.app.currentRouteId = 'dashboard';
  await failing.app._pollOnce();
  await sleep(0);
  assert.equal(failing.props().hasReplied, true, 'a failed pending read still lets the shell draw');
  uninstallDom();
}

// Approve POSTs, re-reads pending and tells the Dashboard; a deny does not.
{
  let pending = [{ ref: 'r1', name: 'Phone', scope: 'admin', code: 'K7Q2X' }];
  const { app, props } = makeApp(ok(), { fetchPending: async () => pending });
  app.canApprove = true;
  let changed = 0;
  app.onPairedDevicesChanged = () => { changed++; };
  await app._pollOnce();
  await sleep(0);
  const posts = [];
  globalThis.fetch = async (url, init) => { posts.push([url, init?.method]); pending = []; return { ok: true, status: 200 }; };
  props().onDecidePairing('r1', 'approve');
  await settle();
  assert.deepEqual(posts, [['/api/pairing/pending/r1/approve', 'POST']]);
  assert.deepEqual(props().pairings, [], 'row gone once the daemon drops it');
  assert.equal(changed, 1, 'device list refresh');

  pending = [{ ref: 'r2', name: 'Tablet', scope: 'admin', code: 'ABCDE' }];
  await app._pollOnce();
  await sleep(0);
  props().onDecidePairing('r2', 'deny');
  await settle();
  assert.deepEqual(posts.at(-1), ['/api/pairing/pending/r2/deny', 'POST']);
  assert.equal(changed, 1, 'deny adds no device');
  globalThis.fetch = realFetchForPairing;
  uninstallDom();
}

// The takeover drops pending rows with everything else.
{
  let fail = false;
  const { app, props } = makeApp(async () => { if (fail) throw new Error('down'); return { reachable: true }; }, { fetchPending: async () => [{ ref: 'r1', name: 'Phone', code: 'K7Q2X' }] });
  app.canApprove = true;
  await app._pollOnce();
  await sleep(0);
  assert.equal(props().pairings.length, 1);
  fail = true;
  await app._pollOnce();
  await app._pollOnce();
  assert.deepEqual(props().pairings, []);
  assert.deepEqual(app.pendingPairings, []);
  uninstallDom();
}

// Light test row (Aurora-exbp): from the poll's test field. Stop test POSTs and re-checks.
{
  let test = { active: true, confirmRemainingMs: 100000, holder: { session: 'agent-1', client: 'mcp' } };
  const { app, props } = makeApp(async () => ({ reachable: true, state: 'running', errors: [], test }));
  app.navigate(blankScreen(), 'dashboard');
  const before = Date.now();
  await app._pollOnce();
  assert.deepEqual(props().lightTest.holder, { session: 'agent-1', client: 'mcp' });
  assert.ok(props().lightTest.endsAtMs >= before + 100000 && props().lightTest.endsAtMs <= Date.now() + 100000, 'the deadline, not the remainder');
  // A live test (confirmRemainingMs null) has a row and no deadline.
  test = { active: true, confirmRemainingMs: null, holder: { session: 'e', client: null } };
  await app._pollOnce();
  assert.deepEqual(props().lightTest, { holder: { session: 'e', client: null }, endsAtMs: null });
  // No holder in the answer still reads as a test.
  test = { active: true, confirmRemainingMs: null };
  await app._pollOnce();
  assert.deepEqual(props().lightTest, { holder: null, endsAtMs: null });
  const posts = [];
  await withFetch(async (url, init) => {
    posts.push([url, init?.method]);
    test = { active: false };
    return { status: 200, json: async () => ({}) };
  }, async () => {
    props().onStopTest();
    await settle();
  });
  assert.deepEqual(posts, [['/api/graph/test/stop', 'POST']]);
  assert.equal(props().lightTest, null, 'the re-poll shows the test gone');
  uninstallDom();
}

// A test alone is a row; the takeover drops it.
{
  let fail = false;
  const { app, props } = makeApp(async () => {
    if (fail) throw new Error('down');
    return { reachable: true, state: 'running', errors: [], test: { active: true, confirmRemainingMs: null, holder: { session: 's', client: null } } };
  });
  await app._pollOnce();
  assert.notEqual(props().lightTest, null);
  fail = true;
  await app._pollOnce();
  await app._pollOnce();
  assert.equal(props().lightTest, null);
  uninstallDom();
}

// The island's announcements go to the one polite live region. Parts raised within the short delay are
// one announcement, and onAnnounce keeps its identity so the island never re-announces on a re-render.
{
  const { app, props, slots } = makeApp(ok());
  const first = props().onAnnounce;
  await app._pollOnce();
  assert.equal(props().onAnnounce, first, 'a stable callback');
  props().onAnnounce("Couldn't resume: two");
  props().onAnnounce("Couldn't start: one");
  await sleep(120);
  assert.equal(slots.get('shell-announcer').textContent, "Couldn't resume: two Couldn't start: one");
  props().onAnnounce('');
  await sleep(120);
  assert.equal(slots.get('shell-announcer').textContent, "Couldn't resume: two Couldn't start: one", 'empty words say nothing');
  uninstallDom();
}

// Without the island bundle the shell still polls and says so once in the console.
{
  const slots = installDom();
  const realError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(' '));
  try {
    const app = new App({ fetchStatus: stateOk(), pollIntervalMs: 100000, abortTimeoutMs: 50 });
    assert.equal(logged.length, 1);
    assert.ok(logged[0].includes('islands.js'));
    assert.equal(await app._pollOnce(), true, 'reachability does not need the island');
    assert.ok(slots.has('shell-island'));
  } finally {
    console.error = realError;
    uninstallDom();
  }
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
