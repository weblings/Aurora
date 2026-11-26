// SettingsPanel (Aurora-vxhm, Aurora-xg8z): the Game Mode row shows only when
// the host reports the launcher, reflects the saved flag, and a toggle PUTs
// gameModeAutostart and reverts on failure. Stub DOM and fetch; run with
// `node SettingsPanel.test.mjs`.
import assert from 'node:assert/strict';
import { SettingsPanel } from './SettingsPanel.js';

const made = [];
globalThis.document = {
  createElement(tag) {
    const input = { checked: false, listener: null, addEventListener(_, fn) { this.listener = fn; } };
    const e = {
      tag, className: '', textContent: '', hidden: false, html: '', input,
      set innerHTML(v) { this.html = v; input.checked = /checked/.test(v); },
      get innerHTML() { return this.html; },
      querySelector: () => input,
    };
    made.push(e);
    return e;
  },
};
const container = () => ({ innerHTML: '', append() {} });

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { json: async () => handler(url, init) }; };
  return calls;
}

// No launcher: no rows, no requests.
{
  const calls = stubFetch(() => ({}));
  const panel = new SettingsPanel(container(), { capabilities: { gameModeLauncher: false } });
  assert.equal(panel.hasRows, false);
  await panel.render();
  assert.equal(calls.length, 0);
  assert.equal(new SettingsPanel(container(), { capabilities: {} }).hasRows, false);
}

// Launcher present: the row reflects the saved flag.
for (const saved of [true, false]) {
  made.length = 0;
  stubFetch(() => ({ gameModeAutostart: saved }));
  const panel = new SettingsPanel(container(), { capabilities: { gameModeLauncher: true } });
  assert.equal(panel.hasRows, true);
  await panel.render();
  const row = made.find((e) => e.className.includes('settings-game-mode'));
  assert.equal(row.input.checked, saved);
}

// A toggle PUTs the new value; a refused save reverts the switch and says so.
for (const ok of [true, false]) {
  made.length = 0;
  const calls = stubFetch((url, init) => (init?.method === 'PUT' ? { succeeded: ok } : { gameModeAutostart: true }));
  const panel = new SettingsPanel(container(), { capabilities: { gameModeLauncher: true } });
  await panel.render();
  const row = made.find((e) => e.className.includes('settings-game-mode'));
  const error = made.find((e) => e.className.includes('settings-error'));
  row.input.checked = false;
  await row.input.listener();
  const put = calls.find((c) => c.init?.method === 'PUT');
  assert.deepEqual(JSON.parse(put.init.body), { gameModeAutostart: false });
  assert.equal(row.input.checked, ok ? false : true);
  assert.equal(error.hidden, ok);
}
console.log('SettingsPanel ok');
