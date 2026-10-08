// Vendor 4 (Aurora-ifkn.4): ZoneActiveToggleList accepts string and numeric
// zone ids, and ignores unknown ids instead of throwing. dataset.zoneId
// always arrives as a string; native ids are numbers (uint8) while the demo
// room rig uses strings. No DOM needed -- container doubles serve stub
// inputs, and the patch queue is replaced after construction so no fetch
// fires. Run with `node ZoneActiveToggle.test.mjs`.
import assert from 'node:assert/strict';
import { ZoneActiveToggleList, findZone } from './ZoneActiveToggle.js';

// Lookup matches either form by strict equality.
{
  assert.deepEqual(findZone([{ zoneId: 1 }], '1'), { zoneId: 1 });
  assert.deepEqual(findZone([{ zoneId: 'front-left' }], 'front-left'), { zoneId: 'front-left' });
  assert.equal(findZone([{ zoneId: 1 }], '999'), undefined);
  assert.equal(findZone([{ zoneId: 1 }], 'front-left'), undefined);
  // Numeric raw id (direct call, not through dataset) matches too.
  assert.deepEqual(findZone([{ zoneId: 2 }], 2), { zoneId: 2 });
}

function makeInput(rawId, checked = true) {
  return {
    dataset: { zoneId: rawId },
    checked,
    listeners: {},
    addEventListener(event, fn) {
      (this.listeners[event] ??= []).push(fn);
    },
  };
}

function mount(zones, inputs) {
  const container = {
    innerHTML: '',
    querySelectorAll(sel) {
      if (sel === 'input[type="checkbox"]') return inputs;
      return [];
    },
  };
  const list = new ZoneActiveToggleList(container, {
    zones,
    zoneLabel: () => 'zone',
    onError: () => {},
  });
  const queued = [];
  list._queue = { queue: (id, patch) => queued.push([id, patch]) };
  return { list, inputs, queued };
}

// Numeric zone flipped through its string dataset id.
{
  const zones = [{ zoneId: 1, active: false }];
  const inputs = [makeInput('1', true)];
  const { queued } = mount(zones, inputs);
  inputs[0].listeners.change[0]({ currentTarget: inputs[0] });
  assert.equal(zones[0].active, true);
  assert.deepEqual(queued, [[1, { active: true }]]);
}

// String zone id flips without coercion.
{
  const zones = [{ zoneId: 'front-left', active: false }];
  const inputs = [makeInput('front-left', true)];
  const { queued } = mount(zones, inputs);
  inputs[0].listeners.change[0]({ currentTarget: inputs[0] });
  assert.equal(zones[0].active, true);
  assert.deepEqual(queued, [['front-left', { active: true }]]);
}

// Unknown id: no throw, no queue write, sibling state untouched.
{
  const zones = [{ zoneId: 1, active: false }];
  const inputs = [makeInput('999', true)];
  const { queued } = mount(zones, inputs);
  inputs[0].listeners.change[0]({ currentTarget: inputs[0] });
  assert.equal(zones[0].active, false);
  assert.deepEqual(queued, []);
}

console.log('ZoneActiveToggle.test.mjs: ok');
