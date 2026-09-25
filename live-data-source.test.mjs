// Live-mapping tests: relay payload shape -> provider frame. No test
// framework dependency (matches web-processing/*.test.mjs convention) --
// run with `node live-data-source.test.mjs`.
import assert from 'node:assert/strict';
import { mapLiveFrame } from './live-data-source.js';

const ZONES = [
  { zoneId: 'front-left', active: true },
  { zoneId: 'front-right', active: true },
  { zoneId: 'back-left', active: true },
  { zoneId: 'back-right', active: true },
];

// Numeric channel ids index the zone map in order (gj0.4 decision).
{
  const frame = mapLiveFrame({ zones: [
    { id: 0, r: 1, g: 0, b: 0 },
    { id: 1, r: 0, g: 1, b: 0 },
    { id: 2, r: 0, g: 0, b: 1 },
    { id: 3, r: 1, g: 1, b: 1 },
  ] }, ZONES);
  assert.equal(frame.length, 4);
  assert.deepEqual(frame[0], { zoneId: 'front-left', color: { r: 1, g: 0, b: 0 } });
  assert.deepEqual(frame[3], { zoneId: 'back-right', color: { r: 1, g: 1, b: 1 } });
}

// Values pass through untouched (already gamma-corrected 0..1 on the wire).
{
  const frame = mapLiveFrame({ zones: [{ id: 2, r: 0.945, g: 0.106, b: 0.106 }] }, ZONES);
  assert.deepEqual(frame, [{ zoneId: 'back-left', color: { r: 0.945, g: 0.106, b: 0.106 } }]);
}

// Empty zone lists (validate.py sentinels) and unknown keys yield no frame.
{
  assert.equal(mapLiveFrame({ zones: [], _validate: 'start' }, ZONES), null);
  assert.equal(mapLiveFrame({ zones: [] }, ZONES), null);
  assert.equal(mapLiveFrame(null, ZONES), null);
  assert.equal(mapLiveFrame({}, ZONES), null);
}

// Out-of-range ids and malformed entries drop; a frame with nothing
// mappable at all yields null rather than an empty frame.
{
  const frame = mapLiveFrame({ zones: [
    { id: 9, r: 1, g: 1, b: 1 },
    { id: 0, r: 1, g: 0, b: 0 },
    { id: 1, r: 'x', g: 0, b: 0 },
  ] }, ZONES);
  assert.deepEqual(frame, [{ zoneId: 'front-left', color: { r: 1, g: 0, b: 0 } }]);
  assert.equal(mapLiveFrame({ zones: [{ id: 9, r: 1, g: 1, b: 1 }] }, ZONES), null);
}

console.log('live-data-source mapping tests passed.');
