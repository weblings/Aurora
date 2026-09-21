// Slider centering contract (Aurora-5jj): WebKit top-aligns
// ::-webkit-slider-thumb without an explicit offset (seen on iOS), while
// Gecko centers its own thumb automatically. Sizes live as vars on
// .slider-input so the offset re-derives on retune; the same assertions run
// against the demo vendor fork, which carries this rule verbatim.
// No test framework dependency (matches dashboard.test.mjs convention) --
// run with `node forms.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const copies = ['./forms.css', '../../../demo/vendor/webui/styles/forms.css'];

for (const rel of copies) {
  const raw = readFileSync(new URL(rel, import.meta.url), 'utf8');
  // Comments carry selector-like prose; strip them before parsing.
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const host = css.match(/(?:^|\})\s*\.slider-input\s*\{([^}]*)\}/m);
  assert.ok(host, `${rel}: .slider-input rule exists`);
  assert.ok(/--slider-track-height\s*:\s*8px/.test(host[1]), `${rel}: track height var is 8px`);
  assert.ok(/--slider-thumb-size\s*:\s*16px/.test(host[1]), `${rel}: thumb size var is 16px`);
  const thumb = css.match(/\.slider-input::-webkit-slider-thumb\s*\{([^}]*)\}/);
  assert.ok(thumb, `${rel}: ::-webkit-slider-thumb rule exists`);
  assert.ok(
    /margin-top\s*:\s*calc\(\(var\(--slider-track-height\)\s*-\s*var\(--slider-thumb-size\)\)\s*\/\s*2\)/.test(
      thumb[1],
    ),
    `${rel}: webkit thumb offset derives from the vars`,
  );
  const moz = css.match(/\.slider-input::-moz-range-thumb\s*\{([^}]*)\}/);
  assert.ok(moz, `${rel}: ::-moz-range-thumb rule exists`);
  assert.ok(!/margin-top/.test(moz[1]), `${rel}: gecko thumb keeps auto-centering (no offset)`);
}

console.log('forms.test.mjs: ok');
