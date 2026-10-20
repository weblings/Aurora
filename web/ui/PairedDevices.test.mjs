// Paired devices list (Aurora-5ipy.6): rows with name and dates, Revoke
// DELETEs and reloads, a store_write_failed revoke says it won't survive a
// restart. Container double parses Revoke buttons out of the rendered HTML.
// Run with `node PairedDevices.test.mjs`.
import assert from 'node:assert/strict';
import { PairedDevices } from './PairedDevices.js';

function makeContainer() {
  let buttons = [];
  let html = '';
  return {
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      buttons = [...value.matchAll(/class="btn btn-secondary paired-device-revoke" data-id="([^"]*)"/g)].map((m) => ({
        dataset: { id: m[1] },
        handlers: [],
        addEventListener(_event, fn) { this.handlers.push(fn); },
        click() { for (const fn of this.handlers) fn(); },
      }));
    },
    querySelectorAll() { return buttons; },
    revokeButton(id) { return buttons.find((b) => b.dataset.id === id); },
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const realFetch = globalThis.fetch;
const day = 86400;

function stubFetch({ devices, deleteStatus = 200, deleteBody = { succeeded: true } }) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push([url, init?.method ?? 'GET']);
    if (init?.method === 'DELETE') {
      if (deleteStatus === 200) devices.splice(devices.findIndex((d) => url.endsWith(d.id)), 1);
      return { status: deleteStatus, ok: deleteStatus < 300, json: async () => deleteBody };
    }
    return { status: 200, ok: true, json: async () => ({ devices: [...devices] }) };
  };
  return calls;
}

// Rows: escaped name, paired date, last-used only when it differs.
{
  const devices = [
    { id: 'a1', name: '<Phone>', scope: 'admin', createdAt: 1760000000, lastSeen: 1760000000 + 3 * day },
    { id: 'b2', name: 'Tablet', scope: 'admin', createdAt: 1760000000, lastSeen: 1760000000 },
  ];
  stubFetch({ devices });
  const container = makeContainer();
  const list = new PairedDevices(container);
  list.render();
  assert.ok(container.innerHTML.includes('Loading'), 'loading before the first answer');
  await list.load();
  assert.ok(container.innerHTML.includes('&lt;Phone&gt;'), 'name escaped');
  assert.equal((container.innerHTML.match(/last used/g) ?? []).length, 1, 'last used only when it differs');
  assert.ok(container.revokeButton('a1') && container.revokeButton('b2'), 'one Revoke per device');
}

// Revoke: DELETE, then the list reloads without the device.
{
  const devices = [{ id: 'a1', name: 'Phone', createdAt: 1760000000, lastSeen: 0 }];
  const calls = stubFetch({ devices });
  const container = makeContainer();
  const list = new PairedDevices(container);
  await list.load();
  container.revokeButton('a1').click();
  await sleep(5);
  assert.deepEqual(calls.filter(([, m]) => m === 'DELETE'), [['/api/pairing/devices/a1', 'DELETE']]);
  assert.ok(container.innerHTML.includes('No other devices are paired'), 'empty state after revoke');
  assert.ok(!container.innerHTML.includes('status-text-error'));
}

// store_write_failed: revoked until restart, says so.
{
  const devices = [{ id: 'a1', name: 'Phone', createdAt: 1760000000, lastSeen: 0 }];
  stubFetch({ devices, deleteStatus: 500, deleteBody: { succeeded: false, error: 'store_write_failed' } });
  const container = makeContainer();
  const list = new PairedDevices(container);
  await list.load();
  container.revokeButton('a1').click();
  await sleep(5);
  assert.ok(container.innerHTML.includes('Revoked until Aurora restarts'));
}

// Unreachable: pokes the shell, no inline error.
{
  globalThis.fetch = async () => { throw new Error('down'); };
  let poked = 0;
  const container = makeContainer();
  const list = new PairedDevices(container, { onUnreachable: () => { poked++; } });
  await list.load();
  assert.equal(poked, 1);
  assert.ok(!container.innerHTML.includes('status-text-error'));
}

globalThis.fetch = realFetch;
console.log('PairedDevices checks passed.');
