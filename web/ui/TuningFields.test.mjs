// TuningFields monitor resolution (Aurora-5ipy.28): a saved key or name
// picks the monitor whose resolution feeds the subsample-width candidates.
// Run with `node TuningFields.test.mjs`.
import assert from 'node:assert/strict';
import { resolveMonitor } from './TuningFields.js';
import { AUTO_MONITOR_VALUE } from './DeviceField.js';

const monitors = [
  { key: 'k-primary', name: 'DISPLAY1', width: 1920, height: 1080, isPrimary: true },
  { key: 'k-wide', name: 'DISPLAY2', width: 3440, height: 1440, isPrimary: false },
];

// A saved key resolves to its monitor, not monitors[0].
assert.equal(resolveMonitor(monitors, 'k-wide').width, 3440);

// A pre-key saved name still resolves.
assert.equal(resolveMonitor(monitors, 'DISPLAY2').width, 3440);

// Key wins over a name that happens to match another monitor.
assert.equal(resolveMonitor([
  { key: 'DISPLAY2', name: 'DISPLAY1', width: 100, height: 100 },
  { key: 'other', name: 'DISPLAY2', width: 200, height: 200 },
], 'DISPLAY2').width, 100);

// Auto picks the primary, unmatched falls back to monitors[0], empty list is null.
assert.equal(resolveMonitor([monitors[1], monitors[0]], AUTO_MONITOR_VALUE).key, 'k-primary');
assert.equal(resolveMonitor(monitors, 'gone').key, 'k-primary');
assert.equal(resolveMonitor([], 'k-wide'), null);

console.log('TuningFields.test.mjs: ok');
