// Toggle-sync canvas half (Aurora-ifkn.5): refreshActive() re-syncs the
// embedded Active bool from the live zone objects without a full re-render.
// Prototype-called against container doubles -- no DOM needed. Run with
// `node ZoneCanvas.test.mjs`.
import assert from 'node:assert/strict';
import { ZoneCanvas } from './ZoneCanvas.js';

function canvasWith({ zones, selectedZoneId, box }) {
  const inst = Object.create(ZoneCanvas.prototype);
  inst.zones = zones;
  inst._selectedZoneId = selectedZoneId;
  inst.container = { querySelector: () => box ?? null };
  return inst;
}

// Re-syncs the box from the selected zone.
{
  const box = { checked: false };
  canvasWith({ zones: [{ zoneId: 1, active: true }], selectedZoneId: 1, box }).refreshActive();
  assert.equal(box.checked, true);
}

// Unknown selection falls back to zones[0], same as _render().
{
  const box = { checked: true };
  canvasWith({ zones: [{ zoneId: 1, active: false }], selectedZoneId: 999, box }).refreshActive();
  assert.equal(box.checked, false);
}

// No box mounted (renderActive false): a no-op, never throws.
{
  canvasWith({ zones: [{ zoneId: 1, active: true }], selectedZoneId: 1, box: null }).refreshActive();
}

// Shared objects, both directions: a sibling flip mutates the same zone,
// refreshActive picks it up without touching anything else.
{
  const zones = [
    { zoneId: 1, active: true },
    { zoneId: 2, active: false },
  ];
  const box = { checked: false };
  const inst = canvasWith({ zones, selectedZoneId: 2, box });
  zones[1].active = true; // sibling (Bridge list) flip
  inst.refreshActive();
  assert.equal(box.checked, true);
}

console.log('ZoneCanvas.test.mjs: ok');
