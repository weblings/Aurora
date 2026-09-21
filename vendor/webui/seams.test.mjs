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
assert.ok(dashboard.includes('DEMO SEAM no-stop-button'), 'Stop cut marker present');
assert.ok(!dashboard.includes("trailingButton: { label: 'Stop'"), 'Stop wiring stays cut');

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

// Logo port (Aurora-tnk): the vendored top bar supports the brand mark and
// the Dashboard passes it with a fork-local path -- never page-relative.
const topBar = read('topBar.js');
assert.ok(topBar.includes('logo = null'), 'vendored top bar takes the logo option');
assert.ok(topBar.includes('top-bar-logo'), 'vendored top bar renders the brand mark');
const dashTopBar = (dashboard.match(/renderTopBar\([^;]*\);/g) || []).join('\n');
assert.ok(dashTopBar.includes("logo: { src: 'vendor/webui/icons/aurora-logo.png'"), 'dashboard brand mark uses the fork-local artwork');
assert.ok(!/['"]icons\/aurora-logo\.png/.test(dashTopBar), 'brand mark stays off the page-relative icons/ path');
assert.ok(read('styles/shell.css').includes('.top-bar-logo'), 'brand-mark CSS vendored');

const toggles = read('ZoneActiveToggle.js');
assert.ok(toggles.includes('DEMO SEAM string-zone-ids'), 'string-id seam marker present');
assert.ok(!toggles.includes('Number(e.currentTarget.dataset.zoneId)'),
  'numeric coercion stays out -- it NaNs string ids and crashes the handler');
assert.ok(toggles.includes('if (!zone) return'), 'unknown-id guard stays');
assert.ok(toggles.includes('this.onChange?.(zone)'), 'List notifies owner on flip');

const canvas = read('ZoneCanvas.js');
assert.ok(canvas.includes('refreshActive()'), 'Canvas exposes bool re-sync');
assert.ok(canvas.includes('this.onActiveChange?.(zone)'), 'Canvas notifies owner on flip');

const dashScreen = read('screens/DashboardScreen.js');
assert.ok(dashScreen.includes('onChange: () => this.zoneCanvas?.refreshActive()'),
  'Bridge flips re-sync the Zone Mapping bool');
assert.ok(dashScreen.includes('onActiveChange: () => this._renderBridgeZoneList()'),
  'Zone Mapping flips re-render the Bridge list');

console.log('vendor seam checks passed.');
