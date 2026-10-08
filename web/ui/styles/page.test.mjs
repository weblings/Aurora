// Page-rule split contract (Aurora-ifkn.2): shell.css carries component
// rules only; the page-wide *, html, body rules live in page.css, linked
// by index.html. No DOM harness exists for styles (same convention as
// welcome.test.mjs) -- run with `node page.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const index = read('../index.html');
const page = read('./page.css').replace(/\/\*[\s\S]*?\*\//g, '');
const shell = read('./shell.css').replace(/\/\*[\s\S]*?\*\//g, '');

{
  assert.ok(index.includes('styles/page.css'), 'page stylesheet is linked in index.html');
  assert.ok(
    index.indexOf('styles/page.css') < index.indexOf('styles/shell.css'),
    'page reset loads before shell components (original in-file order)',
  );
}

{
  // Acceptance: no bare page-wide rule left in shell.css (same shapes the
  // vendor seam tripwire guards against in seams.test.mjs).
  for (const line of shell.split('\n')) {
    assert.ok(!/^\s*\*\s*\{/.test(line), `bare reset leaked: ${line}`);
    assert.ok(!/^html\s*\{/.test(line), `bare html rule leaked: ${line}`);
    assert.ok(!/^body\s*\{/.test(line), `bare body rule leaked: ${line}`);
  }
  assert.ok(/\.top-bar\s*\{/.test(shell), 'component rules stay in shell.css');
}

{
  assert.ok(/^\s*\*\s*\{/m.test(page), '* reset lives in page.css');
  assert.ok(/^html\s*\{/m.test(page), 'html rule lives in page.css');
  assert.ok(/^body\s*\{/m.test(page), 'body rule lives in page.css');
  assert.ok(/scrollbar-gutter\s*:\s*stable/.test(page), 'scrollbar gutter reservation kept');
  assert.ok(/overflow-x\s*:\s*clip/.test(page), 'clip (not hidden) keeps the sticky banner on the viewport');
}

console.log('page.test.mjs: ok');
