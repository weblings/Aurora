// Vendor byte-identity tripwire (Aurora-ifkn.7): every MANIFEST.json
// modules/styles/icons file must equal its web/ui source byte for byte.
// The fork carries no tweaks anymore (ifkn.1-6 upstreamed each seam), so a
// re-vendor that overwrites without re-running sync-webui.py -- or a web/ui
// edit without re-syncing -- fails HERE, not as a blank chevron or a
// tooltip-less render in the browser. No framework -- run with
// `node vendor/webui/seams.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const vendor = fileURLToPath(new URL('.', import.meta.url));
const ui = join(vendor, '..', '..', '..', 'ui');
const manifest = JSON.parse(readFileSync(join(vendor, 'MANIFEST.json'), 'utf8'));

for (const rel of [...manifest.modules, ...manifest.styles, ...manifest.icons]) {
  const ours = readFileSync(join(vendor, rel));
  const theirs = readFileSync(join(ui, rel));
  assert.ok(ours.equals(theirs), `${rel} differs from web/ui -- re-run sync-webui.py`);
}
console.log(`vendor byte-identity checks passed (${manifest.modules.length} modules, ${manifest.styles.length} styles, ${manifest.icons.length} icons).`);

// Stop capability (Aurora-ifkn.3): the Dashboard gates its button on GET
// /api/state's canStop (default true); the shim answers false, so the demo
// shows no Stop while the app shows it. POST /api/stop needs no shim route.
const dashboard = readFileSync(join(vendor, 'screens', 'DashboardScreen.js'), 'utf8');
assert.ok(dashboard.includes('canStop'), 'dashboard gates Stop on the capability flag');
assert.ok(readFileSync(join(vendor, '..', '..', 'demo-shim.js'), 'utf8').includes('canStop: false'), 'shim turns Stop off');

// Toggle-sync (Aurora-ifkn.5) is upstream now: both callbacks ship in the
// identical copies, and the Dashboard wires them natively -- no demo
// subclass re-attaching them.
const boot = readFileSync(join(vendor, '..', '..', 'demo-boot.js'), 'utf8');
assert.ok(!boot.includes('DemoDashboardScreen'), 'demo subclass removed, upstream wiring serves');
assert.ok(boot.includes('new DashboardScreen('), 'demo mounts the vendored screen directly');

// Page-scope split (Aurora-ifkn.2): web/ui's bare rules live in page.css
// (never vendored); the demo's equivalents stay scoped under .db-port in
// demo-owned demo-layout.css, so the scene page never inherits them.
const shell = readFileSync(join(vendor, 'styles', 'shell.css'), 'utf8');
for (const line of shell.split('\n')) {
  assert.ok(!/^\s*\*\s*\{/.test(line), `bare reset leaked: ${line}`);
  assert.ok(!/^html\s*\{/.test(line), `bare html rule leaked: ${line}`);
  assert.ok(!/^body\s*\{/.test(line), `bare body rule leaked: ${line}`);
}
const layout = readFileSync(join(vendor, '..', '..', 'demo-layout.css'), 'utf8');
assert.ok(layout.includes('.db-port'), 'demo keeps its own dashboard-pane scope');

// Icon mechanism (Aurora-ifkn.1): module-relative URLs work from any mount,
// so no fork-local artwork path may appear in the vendored copies.
for (const name of ['Dropdown.js', 'NavFooter.js', 'topBar.js', 'screens/DashboardScreen.js']) {
  const text = readFileSync(join(vendor, name), 'utf8');
  assert.ok(!/['"]icons\//.test(text), `${name} still references page-relative icons/`);
  assert.ok(!text.includes('vendor/webui/icons/'), `${name} still references fork-local artwork`);
}

// Version footer (Aurora-qdk, mirrors web/ui): the shim answers
// /api/version, so the Pages footer shows the release text.
assert.ok(dashboard.includes('db-version'), 'footer slot mounted');
assert.ok(dashboard.includes("fetch('/api/version')"), 'footer probes /api/version');

// Audio-sinks dropdown (Aurora-67y, mirrors web/ui): the vendored
// DeviceField loads the list from GET /api/state's audioDevicesUrl; the
// shim answers both, so the ported dropdown populates in audio mode.
const deviceField = readFileSync(join(vendor, 'DeviceField.js'), 'utf8');
assert.ok(deviceField.includes('loadAudioSinksFrom(audioDevicesUrl)'), 'device field loads the advertised device list');

console.log('vendor seam checks passed.');
