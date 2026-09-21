// Layout contract tests: the dashboard pane sits outside .db-port's scoped
// reset, so its own box model must be declared here, not inherited. No test
// framework dependency (matches demo-shim.test.mjs convention) --
// run with `node demo-layout.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./demo-layout.css', import.meta.url), 'utf8');

function ruleBlocks(selector) {
  const blocks = [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]);
  assert.ok(blocks.length > 0, `${selector} rule exists in demo-layout.css`);
  return blocks;
}

// Portrait regression (2026-09): #dashboard-pane is the PARENT of .db-port,
// so `.db-port * { box-sizing: border-box }` never reaches it. In content-box
// the 16px side padding adds outside width:100%, pushing the pane 32px past
// the viewport while body overflow hides it -- the right padding vanishes
// off-screen, left intact, with no overflowing descendant to blame.
// Landscape hid it: row-axis flex-shrink absorbs the extra width, and column
// layout has no cross-axis shrink.
{
  // #dashboard-pane appears in the aspect-ratio media queries too -- the
  // invariant lives on the top-level block, the one carrying the padding.
  const pane = ruleBlocks('#dashboard-pane').find((b) => /padding\s*:/.test(b));
  assert.ok(pane, 'top-level #dashboard-pane block exists');
  assert.ok(/box-sizing\s*:\s*border-box/.test(pane), '#dashboard-pane is border-box');
  assert.ok(/padding\s*:\s*12px\s+16px\s+24px/.test(pane), 'pane keeps its 12/16/24 breathing room');
}

// Demo scope (Aurora-egp): no capture devices exist on a static page, so the
// whole Dashboard top tier (Monitor picker / sink field) is hidden outright.
// Logo + Stop live in the top-bar slot and are unaffected.
{
  const tier = ruleBlocks('\\.db-port\\s+\\.db-top-tier');
  assert.ok(tier.some((b) => /display\s*:\s*none/.test(b)), '.db-top-tier is hidden in demo');
  assert.ok(
    !/\.db-device-slot\[inert\]/.test(css),
    'inert+dim device-slot rule is gone (superseded by the tier hide)',
  );
}

console.log('demo-layout.test.mjs: ok');
