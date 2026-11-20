// Pair this device (Aurora-5ipy.6): request -> code + polling -> approved
// calls onComplete; declined/expired and 429 land back on the form with an
// error; Cancel and unmount stop the poll. Element doubles, fetch stubbed,
// real timers at a 1 ms poll. Run with `node screens/PairingScreen.test.mjs`.
import assert from 'node:assert/strict';
import { PairingScreen } from './PairingScreen.js';

// Writing innerHTML drops cached children, like a real DOM replacing nodes.
function makeEl() {
  const children = new Map();
  let html = '';
  return {
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; children.clear(); },
    value: '',
    disabled: false,
    listeners: {},
    addEventListener(event, fn) { (this.listeners[event] ??= []).push(fn); },
    fire(event) { for (const fn of this.listeners[event] ?? []) fn({ currentTarget: this }); },
    querySelector(sel) {
      if (!children.has(sel)) children.set(sel, makeEl());
      return children.get(sel);
    },
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Windows timers tick at ~15 ms, so wait on the outcome, not a fixed sleep.
async function until(predicate, timeoutMs = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await sleep(1);
  }
}
const realFetch = globalThis.fetch;

// Scripted fetch: each route answers from its own queue (last answer repeats).
function stubFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body });
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    const queue = routes[key];
    const [status, body] = queue.length > 1 ? queue.shift() : queue[0];
    return { status, ok: status < 300, json: async () => body };
  };
  return calls;
}

async function mounted(opts = {}) {
  const container = makeEl();
  let completed = 0;
  const app = { checkNow: async () => true };
  const screen = new PairingScreen(app, { onComplete: () => { completed++; }, pollIntervalMs: 1, userAgent: 'Mozilla/5.0 (iPhone)', ...opts });
  await screen.mount(container);
  const body = container.querySelector('.pairing-body');
  const footer = container.querySelector('.nav-footer-slot');
  return { screen, body, footer, completed: () => completed };
}

// Intro: guessed name prefilled, Pair this device in the footer.
{
  const { body, footer } = await mounted();
  assert.ok(body.innerHTML.includes("This device isn't paired yet"));
  assert.equal(body.querySelector('#pairing-name-input').value, 'iPhone');
  assert.ok(footer.innerHTML.includes('Pair this device'));
}

// Happy path: request sends the edited name as admin, shows the code,
// polls through pending, then approved calls onComplete once.
{
  const calls = stubFetch({
    '/api/pairing/request/': [[202, { state: 'pending' }], [202, { state: 'pending' }], [200, { state: 'approved', token: 'aur_x' }]],
    '/api/pairing/request': [[202, { pollKey: 'pk1', code: 'K7Q2X' }]],
  });
  const { screen, body, completed } = await mounted();
  screen.deviceName = ' Kitchen <tablet> ';
  await screen._request();
  const post = calls.find((c) => c.method === 'POST');
  assert.deepEqual(JSON.parse(post.body), { name: 'Kitchen <tablet>', scope: 'admin' });
  assert.equal(screen.phase, 'waiting');
  assert.ok(body.innerHTML.includes('K7Q2X'), 'code shown');
  assert.ok(body.innerHTML.includes('Kitchen &lt;tablet&gt;'), 'name escaped');
  await until(() => completed() > 0);
  await sleep(20);
  assert.equal(completed(), 1, 'approved poll completes once');
  assert.equal(calls.filter((c) => c.url === '/api/pairing/request/pk1').length, 3);
  screen.unmount();
}

// Declined, expired or forgotten: back to the form with the matching error and no more polls.
for (const [code, state, expected] of [
  [403, 'denied', 'declined'],
  [410, 'expired', 'expired'],
  [404, 'unknown', 'no longer knows'],
]) {
  const calls = stubFetch({
    '/api/pairing/request/': [[code, { state }]],
    '/api/pairing/request': [[202, { pollKey: 'pk2', code: 'ABCDE' }]],
  });
  const { screen, body, completed } = await mounted();
  await screen._request();
  await until(() => screen.phase === 'intro');
  assert.ok(body.innerHTML.includes(expected), `${code} shows "${expected}"`);
  assert.equal(completed(), 0);
  const polls = calls.filter((c) => c.url.startsWith('/api/pairing/request/')).length;
  await sleep(40);
  assert.equal(calls.filter((c) => c.url.startsWith('/api/pairing/request/')).length, polls, 'polling stopped');
}

// slow_down keeps polling.
{
  const calls = stubFetch({
    '/api/pairing/request/': [[429, { error: 'slow_down' }], [200, { state: 'approved' }]],
    '/api/pairing/request': [[202, { pollKey: 'pk3', code: 'ABCDE' }]],
  });
  const { screen, completed } = await mounted();
  await screen._request();
  await until(() => completed() > 0);
  assert.equal(calls.filter((c) => c.url === '/api/pairing/request/pk3').length, 2);
  screen.unmount();
}

// Too many pending: 429 copy, stays on the form.
{
  stubFetch({ '/api/pairing/request': [[429, { error: 'too_many_pending' }]] });
  const { screen, body } = await mounted();
  await screen._request();
  assert.equal(screen.phase, 'intro');
  assert.ok(body.innerHTML.includes('Too many devices are waiting'));
}

// Cancel and unmount both stop polling.
{
  const calls = stubFetch({
    '/api/pairing/request/': [[202, { state: 'pending' }]],
    '/api/pairing/request': [[202, { pollKey: 'pk3', code: 'QQQQQ' }]],
  });
  const { screen, footer } = await mounted();
  await screen._request();
  footer.querySelector('.nav-footer-continue').fire('click'); // Cancel
  assert.equal(screen.phase, 'intro');
  const count = calls.length;
  await sleep(40);
  assert.equal(calls.length, count, 'cancel stops polling');

  await screen._request();
  screen.unmount();
  const afterUnmount = calls.length;
  await sleep(40);
  assert.equal(calls.length, afterUnmount, 'unmount stops polling');
}

// Network failure with the daemon gone: the takeover owns it, no inline error.
{
  globalThis.fetch = async () => { throw new Error('down'); };
  const { screen, body } = await mounted();
  screen.app.checkNow = async () => false;
  body.innerHTML = 'untouched';
  await screen._request();
  assert.equal(screen.error, null);
  assert.equal(body.innerHTML, 'untouched');
}

globalThis.fetch = realFetch;
console.log('PairingScreen checks passed.');
