// Narrow-viewport contract: the accordion pills and the dashboard top bar
// overhang the content column by 21px a side, but #screen-container's page
// gutter is only 16px (shell.css) -- below 650px viewport width there is no
// centering margin left to absorb the extra 5px, so pills and Stop button
// touch both screen edges (seen at 292px). The @media accommodation below
// scales the overhang back inside the gutter while keeping the desktop look
// intact. No test framework dependency (matches demo-layout.test.mjs
// convention) -- run with `node dashboard.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Comments carry "@media" and selector-like prose ("keep all three in
// sync"), so strip them before parsing -- otherwise the splitter below
// mistakes comment text for a rule block.
const css = readFileSync(new URL('./dashboard.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

// Split top-level CSS from @media bodies (brace-counted, not regex).
function splitMedia(src) {
  const topLevel = [];
  const media = []; // { prelude, body }
  let rest = src;
  while (true) {
    const at = rest.indexOf('@media');
    if (at === -1) {
      topLevel.push(rest);
      break;
    }
    topLevel.push(rest.slice(0, at));
    const open = rest.indexOf('{', at);
    assert.ok(open !== -1, '@media block opens');
    let depth = 0;
    let close = -1;
    for (let i = open; i < rest.length; i++) {
      if (rest[i] === '{') depth++;
      if (rest[i] === '}') {
        depth--;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    assert.ok(close !== -1, '@media block closes');
    media.push({ prelude: rest.slice(at, open), body: rest.slice(open + 1, close) });
    rest = rest.slice(close + 1);
  }
  return { top: topLevel.join(''), media };
}

function ruleBlock(src, selector) {
  const m = src.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `${selector} rule exists`);
  return m[1];
}

const { top, media } = splitMedia(css);

// Desktop look is untouched: the literal 21px/42px design values still live
// on the top-level rules (the overhang fits wherever the centering margin
// covers the 5px it exceeds the 16px gutter by: (vw-640)/2 >= 5 -> vw >= 650).
{
  const pill = ruleBlock(top, '\\.accordion-header');
  assert.ok(/width\s*:\s*calc\(100%\s*\+\s*42px\)/.test(pill), 'pill keeps 42px width offset');
  assert.ok(/margin-inline\s*:\s*-21px/.test(pill), 'pill keeps -21px overhang');
  assert.ok(/padding\s*:[^;]*21px/.test(pill), 'pill keeps 21px inner padding');
  const bar = ruleBlock(top, '\\.db-top-bar-slot\\s+\\.top-bar');
  assert.ok(/width\s*:\s*calc\(100%\s*\+\s*42px\)/.test(bar), 'top bar keeps 42px width offset');
  assert.ok(/margin-inline\s*:\s*-21px/.test(bar), 'top bar keeps -21px overhang');
}

// Narrow viewports: one media query at the 650px threshold scales BOTH
// overhangs back inside the gutter so the leftover side breathing room
// matches the top bar's own top padding (even frame at any width). Both
// selectors must be present -- the Stop button borrows the top-bar width
// rules, so fixing only the pills leaves the button on the edges.
{
  const narrow = media.filter((m) => /max-width\s*:\s*649px/.test(m.prelude));
  assert.ok(narrow.length > 0, 'narrow-viewport media query exists at the 650px threshold');
  const body = narrow.map((m) => m.body).join('\n');
  for (const selector of ['\\.accordion-header', '\\.db-top-bar-slot\\s+\\.top-bar']) {
    const block = ruleBlock(body, selector);
    assert.ok(/width\s*:\s*calc\(100%\s*\+\s*12px\)/.test(block), `${selector} narrows to 12px width offset`);
    assert.ok(/margin-inline\s*:\s*-6px/.test(block), `${selector} narrows to -6px overhang`);
  }
  const pill = ruleBlock(body, '\\.accordion-header');
  assert.ok(
    /padding\s*:[^;]*var\(--aurora-space-2\)/.test(pill),
    'narrow pill inner padding tracks the 6px overhang',
  );

  // Side breathing (gutter minus overhang) equals the top breathing: the
  // page gutter is --aurora-space-6 on #screen-container (shell.css) and
  // the top inset is the top bar's padding-top (shell.css) -- currently
  // --aurora-space-4, resolved through tokens.css.
  const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const shell = strip(readFileSync(new URL('./shell.css', import.meta.url), 'utf8'));
  const tokenValue = (name) => {
    const m = tokens.match(new RegExp(`${name}\\s*:\\s*(\\d+)px`));
    assert.ok(m, `${name} resolves from tokens.css`);
    return Number(m[1]);
  };
  const gutter = tokenValue('--aurora-space-6');
  const topBar = ruleBlock(splitMedia(shell).top, '\\.top-bar');
  const topPadVar = topBar.match(/padding\s*:\s*var\((--aurora-space-\d+)\)/);
  assert.ok(topPadVar, '.top-bar padding-top references a spacing token');
  assert.equal(
    gutter - 6,
    tokenValue(topPadVar[1]),
    'narrow side breathing matches the top bar top padding',
  );
}

console.log('dashboard.test.mjs: ok');
