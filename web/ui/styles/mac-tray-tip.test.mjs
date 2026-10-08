// Mac menu-bar tip contract (Aurora-qps.8): text assertions over the screen,
// its stylesheet, index.html, and app.js's wiring -- no DOM harness exists
// for screens (same convention as welcome.test.mjs). No test framework
// dependency -- run with `node mac-tray-tip.test.mjs`.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const screen = read('../screens/MacTrayTipScreen.js');
const css = read('./mac-tray-tip.css').replace(/\/\*[\s\S]*?\*\//g, '');
const index = read('../index.html');
const app = read('../app.js');

{
  const gif = new URL('../icons/MacTray.gif', import.meta.url);
  assert.ok(existsSync(gif), 'GIF lives under web/ui so the embedded webroot carries it');
  assert.ok(statSync(gif).size > 0, 'GIF is non-empty');
  assert.ok(screen.includes('../icons/MacTray.gif') && screen.includes('import.meta.url'), 'screen resolves the GIF against its own module');
  assert.match(screen, /alt="[^"]+menu bar[^"]*"/, 'GIF has descriptive alt text');
  assert.ok(screen.includes('menu bar'), 'copy uses menu bar wording');
  assert.ok(screen.includes('Launch UI') && screen.includes('Stop'), 'copy names the menu items');
}

{
  assert.ok(index.includes('styles/mac-tray-tip.css'), 'stylesheet is linked individually in index.html');
  const gif = css.match(/\.mac-tray-tip-gif\s*\{([^}]*)\}/);
  assert.ok(gif, 'gif rule exists');
  assert.match(gif[1], /max-width\s*:\s*398px/, 'never upscaled past the GIF native width');
  assert.match(gif[1], /height\s*:\s*auto/, 'aspect ratio preserved');
}

{
  // Wiring: platform gate, Back/Continue routing, discovery hand-off.
  assert.ok(app.includes('platform: capabilities.platform'), 'probeState returns platform');
  assert.ok(app.includes("const isMac = platform === 'mac'"), 'tip is gated on the mac platform');
  assert.ok(
    app.includes('isMac ? showMacTip(discoveryPromise) : showOutputConnect(discoveryPromise, showWelcome)'),
    'Welcome goes to the tip on Mac, straight to Output Connect elsewhere',
  );
  assert.ok(
    app.includes('showOutputConnect(discoveryPromise, () => showMacTip(discoveryPromise))'),
    'Output Connect Back returns to the tip on Mac',
  );
  assert.ok(screen.includes('this.onComplete(this.discoveryPromise)'), 'tip hands the in-flight discovery promise forward');
  assert.ok(!screen.includes('/api/hue/discover'), 'tip never starts its own discovery');
}

console.log('mac-tray-tip.test.mjs: ok');
