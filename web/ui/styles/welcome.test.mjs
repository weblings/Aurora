// Welcome brand-mark contract (Aurora-gv0): the Setup title text is
// replaced by the Aurora logo at a trial 4x the title type size, scoped to
// this screen so the Dashboard artwork is untouched. No DOM harness exists
// for screens, so the call site is asserted as text and the sizing as CSS.
// No test framework dependency (matches dashboard.test.mjs convention) --
// run with `node welcome.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../screens/WelcomeScreen.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./welcome.css', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./shell.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

{
  assert.ok(screen.includes('top-bar-slot welcome-top'), 'slot carries the welcome scope class');
  assert.ok(
    screen.includes("logo: { src: 'icons/aurora-logo.png'"),
    'Setup title passes the brand mark',
  );
}

{
  const bar = css.match(/\.welcome-top\s+\.top-bar\s*\{([^}]*)\}/);
  assert.ok(bar, 'welcome bar sizing rule exists');
  const logo = css.match(/\.welcome-top\s+\.top-bar-logo\s*\{([^}]*)\}/);
  assert.ok(logo, 'welcome logo sizing rule exists');
  const barMin = bar[1].match(/min-height\s*:\s*(\d+)px/);
  const logoHeight = logo[1].match(/height\s*:\s*(\d+)px/);
  assert.ok(barMin && logoHeight, 'welcome bar and logo carry literal sizes');
  assert.equal(barMin[1], logoHeight[1], 'bar fits the artwork exactly');

  // Trial size is 8x the title type it replaces (.top-bar-title in the
  // shared shell), not a second magic number.
  const title = shell.match(/\.top-bar-title\s*\{([^}]*)\}/);
  assert.ok(title, '.top-bar-title rule exists in shell.css');
  const typeSize = title[1].match(/font-size\s*:\s*(\d+)px/);
  assert.ok(typeSize, 'title type size is literal');
  assert.equal(Number(logoHeight[1]), Number(typeSize[1]) * 8, 'logo trial size is 8x title type');
}

console.log('welcome.test.mjs: ok');
