// node web/ui/NavFooter.test.mjs
import assert from 'node:assert/strict';
import { renderNavFooter } from './NavFooter.js';

function makeContainer() {
  const buttons = {};
  return {
    buttons,
    innerHTML: '',
    querySelector(sel) {
      return (buttons[sel] ??= { handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; } });
    },
  };
}

// Island path: options go to the mounted island and a re-render unmounts the old one first.
{
  const calls = [];
  const unmounted = [];
  globalThis.auroraIslands = {
    mountNavFooter: (el, props) => { calls.push({ el, props }); return () => unmounted.push(calls.length); },
  };
  const c = makeContainer();
  const onContinue = () => {};
  renderNavFooter(c, { onContinue });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].el, c);
  assert.deepEqual(
    { ...calls[0].props, onContinue: undefined },
    { showBack: true, onBack: undefined, backLabel: 'Back', backIcon: true, continueLabel: 'Continue', continueDisabled: false, onContinue: undefined },
  );
  assert.equal(calls[0].props.onContinue, onContinue);
  renderNavFooter(c, { continueLabel: 'Applying…', continueDisabled: true, onContinue });
  assert.deepEqual(unmounted, [1], 'previous island unmounted before the next mount');
  assert.equal(calls[1].props.continueLabel, 'Applying…');
  assert.equal(calls[1].props.continueDisabled, true);
}

// Fallback path: plain buttons wired to the callbacks, one console error per page.
{
  delete globalThis.auroraIslands;
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    const c = makeContainer();
    let back = 0, next = 0;
    renderNavFooter(c, { onBack: () => back++, onContinue: () => next++ });
    assert.ok(c.innerHTML.includes('nav-footer-back') && c.innerHTML.includes('nav-footer-continue'));
    c.buttons['.nav-footer-back'].handlers.click();
    c.buttons['.nav-footer-continue'].handlers.click();
    assert.deepEqual([back, next], [1, 1]);

    const first = makeContainer();
    renderNavFooter(first, { showBack: false, continueLabel: 'Go <now>', continueDisabled: true, onContinue: () => {} });
    assert.ok(!first.innerHTML.includes('nav-footer-back'));
    assert.ok(first.innerHTML.includes('Go &lt;now&gt;'));
    assert.ok(/nav-footer-continue"\s+disabled/.test(first.innerHTML));
    assert.equal(errors.length, 1);
  } finally {
    console.error = orig;
  }
}

console.log('NavFooter tests passed.');
