// Repo-badge contract (Aurora-9mq): the scene pane carries a rounded pill
// linking at the repo, bottom-offset by the same token as the dashboard
// logo's top inset. No test framework dependency (matches
// demo-layout.test.mjs convention) -- run with `node demo-links.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./demo-layout.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('./vendor/webui/styles/tokens.css', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./vendor/webui/styles/shell.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

{
  const anchor = html.match(/<a[^>]*id="repo-pill"[^>]*>/);
  assert.ok(anchor, '#repo-pill anchor exists in the scene pane');
  assert.ok(anchor[0].includes('href="https://github.com/weblings/Aurora"'), 'pill points at the repo');
  assert.ok(anchor[0].includes('target="_blank"'), 'pill opens a new tab');
  assert.ok(anchor[0].includes('rel="noopener noreferrer"'), 'pill carries noopener noreferrer');
  const element = html.slice(html.indexOf('<a id="repo-pill"'), html.indexOf('</a>', html.indexOf('<a id="repo-pill"')));
  assert.ok(element.includes('<svg') && element.includes('viewBox="0 0 16 16"'), 'pill carries the GitHub mark');
  assert.ok(element.includes('aria-hidden="true"'), 'mark is hidden from assistive tech');
  assert.ok(element.includes('View Source Code'), 'pill uses the RockyRoad upsell wording');
  const pane = html.slice(html.indexOf('<div id="scene-pane">'), html.indexOf('<div id="dashboard-pane">'));
  assert.ok(pane.includes('id="repo-pill"'), 'pill lives inside #scene-pane');
}

{
  const m = css.match(/#repo-pill\s*\{([^}]*)\}/);
  assert.ok(m, '#repo-pill rule exists in demo-layout.css');
  const block = m[1];
  assert.ok(/position\s*:\s*absolute/.test(block), 'pill overlays the scene');
  assert.ok(/left\s*:\s*50%/.test(block) && /translateX\(-50%\)/.test(block), 'pill is horizontally centered');
  assert.ok(/border-radius\s*:\s*999px/.test(block), 'pill is fully rounded');
  assert.ok(/display\s*:\s*inline-flex/.test(block) && /gap\s*:\s*6px/.test(block), 'mark and label sit inline with a gap');
  const svgRule = css.match(/#repo-pill\s+svg\s*\{([^}]*)\}/);
  assert.ok(svgRule && /fill\s*:\s*currentColor/.test(svgRule[1]), 'mark inherits the pill text color');
  const bottom = block.match(/bottom\s*:\s*var\((--aurora-space-\d+)\)/);
  assert.ok(bottom, 'pill bottom offset references a spacing token');

  // The offset token is the top bar's own top padding token (vendor
  // shell.css), so the pill sits as far up from the scene bottom as the
  // logo sits down from its page top.
  const topBar = shell.match(/\.top-bar\s*\{([^}]*)\}/);
  assert.ok(topBar, '.top-bar rule exists in vendor shell.css');
  const topPad = topBar[1].match(/padding\s*:\s*var\((--aurora-space-\d+)\)/);
  assert.ok(topPad, '.top-bar padding-top references a spacing token');
  assert.equal(bottom[1], topPad[1], 'pill offset matches the logo top inset token');
  const value = tokens.match(new RegExp(`${bottom[1]}\\s*:\\s*(\\d+)px`));
  assert.ok(value, 'offset token resolves from vendor tokens.css');
}

console.log('demo-links.test.mjs: ok');
