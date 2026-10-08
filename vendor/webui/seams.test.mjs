// Vendor seam tripwire: the demo's adaptations to its WebUI copies live in
// a handful of marked hunks (see MANIFEST.json seams + notes). A re-vendor
// that overwrites the copies without re-applying them must fail HERE, not as
// a blank chevron or a tooltip-less render in the browser. No framework --
// run with `node vendor/webui/seams.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const vendor = fileURLToPath(new URL('.', import.meta.url));
const read = (p) => readFileSync(join(vendor, p), 'utf8');

const dashboard = read('screens/DashboardScreen.js');
// Stop capability (Aurora-ifkn.3): the fork's hand-cut Stop wiring is gone.
// The screen is byte-identical to web/ui and gates the button on GET
// /api/state's canStop (default true); the shim answers false, so the demo
// shows no Stop while the app shows it. POST /api/stop needs no shim route.
assert.equal(dashboard, read('../../../ui/screens/DashboardScreen.js'), 'vendored screen identical to web/ui');
assert.equal(read('CaptureSource.js'), read('../../../ui/CaptureSource.js'), 'capture source identical (carries the putModeSwitch the screen needs)');
assert.equal(read('MacPermissionRecovery.js'), read('../../../ui/MacPermissionRecovery.js'), 'permission recovery identical (new vendored module)');
assert.ok(dashboard.includes('canStop'), 'dashboard gates Stop on the capability flag');
assert.ok(!dashboard.includes('DEMO SEAM no-stop-button'), 'hand-cut Stop seam gone');
assert.ok(read('../../demo-shim.js').includes('canStop: false'), 'shim turns Stop off');

const shell = read('styles/shell.css');
assert.ok(shell.includes('.db-port *'), 'reset scoped to dashboard pane');
assert.ok(shell.includes('.db-port {'), 'body rules scoped to dashboard pane');
for (const line of shell.split('\n')) {
  assert.ok(!/^\s*\*\s*\{/.test(line), `bare reset leaked: ${line}`);
  assert.ok(!/^html\s*\{/.test(line), `bare html rule leaked: ${line}`);
  assert.ok(!/^body\s*\{/.test(line), `bare body rule leaked: ${line}`);
}

const dropdown = read('Dropdown.js');
const navFooter = read('NavFooter.js');
for (const [name, text] of [['Dropdown.js', dropdown], ['NavFooter.js', navFooter]]) {
  assert.ok(!/['"]icons\//.test(text), `${name} still references page-relative icons/`);
}
assert.ok(dropdown.includes('vendor/webui/icons/chevron-down.svg'), 'dropdown chevron retargeted');
assert.ok(navFooter.includes('vendor/webui/icons/back-arrow.svg'), 'back arrow retargeted');

// Logo port (Aurora-tnk, upstreamed by Aurora-ifkn.1): the brand mark
// resolves against the screen module, so the identical copy works from any
// mount -- never a page- or fork-relative path.
const topBar = read('topBar.js');
assert.ok(topBar.includes('logo = null'), 'vendored top bar takes the logo option');
assert.ok(topBar.includes('top-bar-logo'), 'vendored top bar renders the brand mark');
const dashTopBar = (dashboard.match(/renderTopBar\([^;]*\);/g) || []).join('\n');
assert.ok(dashTopBar.includes('logo: { src: LOGO_URL'), 'dashboard passes the module-relative brand mark');
assert.ok(dashboard.includes("new URL('../icons/aurora-logo.png', import.meta.url)"), 'brand mark resolves against the module');
assert.ok(!dashTopBar.includes('vendor/webui/icons/aurora-logo.png'), 'no fork-local artwork path');
assert.ok(read('styles/shell.css').includes('.top-bar-logo'), 'brand-mark CSS vendored');

// Version footer (Aurora-qdk, mirrors web/ui): the shim answers
// /api/version, so the Pages footer shows the release text.
assert.ok(dashboard.includes('db-version'), 'footer slot mounted');
assert.ok(dashboard.includes("fetch('/api/version')"), 'footer probes /api/version');
assert.ok(read('styles/dashboard.css').includes('.db-version'), 'footer CSS vendored');

// Audio-sinks dropdown (Aurora-67y, mirrors web/ui): since Aurora-kea the
// vendored DeviceField loads the list from GET /api/state's
// audioDevicesUrl (on build and on every open, Aurora-apn); the shim
// answers both, so the ported dropdown populates in audio mode.
assert.ok(read('DeviceField.js').includes('loadAudioSinksFrom(audioDevicesUrl)'), 'device field loads the advertised device list');
assert.ok(read('../../demo-shim.js').includes("audioDevicesUrl: '/api/linux/audio-sinks'"), 'shim advertises the sink list');
assert.ok(read('../../demo-shim.js').includes("path === '/api/linux/audio-sinks'"), 'shim answers the sink list');

// Capability flags (Aurora-kea, mirrors web/ui): the Dashboard reads
// GET /api/state through CaptureSource.js, and the shim answers it.
assert.ok(read('CaptureSource.js').includes("fetch('/api/state')"), 'capture source probes /api/state');
assert.ok(dashboard.includes('loadPipelineState()'), 'dashboard reads the running flags');
assert.ok(read('../../demo-shim.js').includes("path === '/api/state'"), 'shim answers /api/state');
assert.ok(!read('DeviceField.js').includes('device-field-sink-refresh'), 'no refresh button (enter + open cover it)');
assert.ok(!read('DeviceField.js').includes('device-field-sink-hint'), 'no sink hint under the dropdown');

const toggles = read('ZoneActiveToggle.js');
assert.ok(toggles.includes('DEMO SEAM string-zone-ids'), 'string-id seam marker present');
assert.ok(!toggles.includes('Number(e.currentTarget.dataset.zoneId)'),
  'numeric coercion stays out -- it NaNs string ids and crashes the handler');
assert.ok(toggles.includes('if (!zone) return'), 'unknown-id guard stays');
assert.ok(toggles.includes('this.onChange?.(zone)'), 'List notifies owner on flip');

const canvas = read('ZoneCanvas.js');
assert.ok(canvas.includes('refreshActive()'), 'Canvas exposes bool re-sync');
assert.ok(canvas.includes('this.onActiveChange?.(zone)'), 'Canvas notifies owner on flip');

// Toggle-sync (MANIFEST): the identical screen wires no canvas<->list sync
// (upstream has no sibling consumer), so demo-boot.js's DemoDashboardScreen
// re-attaches both directions on the shared zone objects.
const boot = read('../../demo-boot.js');
assert.ok(boot.includes('DemoDashboardScreen'), 'demo subclass carries the seam');
assert.ok(boot.includes('onActiveChange'), 'canvas flips re-render the Bridge list');
assert.ok(boot.includes('refreshActive()'), 'Bridge flips re-sync the canvas bool');

// Pending highlight (Aurora-axoz, mirrors web/ui): the toggle outlines the
// clicked option while the switch is in flight and fills only once the
// running flags confirm it. The shim derives state from its config, so a
// demo switch confirms at once -- no new shim route needed.
assert.ok(read('CaptureSource.js').includes('isSwitchConfirmed'), 'confirm helper ported');
assert.ok(dashboard.includes('pendingMode'), 'dashboard tracks the in-flight switch');
assert.ok(dashboard.includes('isSwitchConfirmed'), 'dashboard fills only on pipeline confirm');
assert.ok(read('styles/forms.css').includes('.segmented-btn.pending'), 'pending outline CSS vendored');

console.log('vendor seam checks passed.');
