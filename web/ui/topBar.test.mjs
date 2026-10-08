// topBar trailing-buttons contract (Aurora-5ipy.13): the Dashboard's Pause +
// Stop pair, plus legacy single-trailingButton compat. No DOM needed -- a
// minimal container double captures innerHTML and serves stub buttons.
// Run with `node topBar.test.mjs`.
import assert from 'node:assert/strict';
import { renderTopBar } from './topBar.js';

function makeEl() {
  return {
    innerHTML: '',
    listeners: {},
    addEventListener(event, fn) {
      (this.listeners[event] ??= []).push(fn);
    },
    querySelector() {
      return makeEl();
    },
  };
}

function render(options) {
  const container = makeEl();
  // Capture the bar HTML while wiring clicks through per-id stubs.
  const stubs = new Map();
  container.querySelector = (sel) => {
    if (!stubs.has(sel)) stubs.set(sel, makeEl());
    return stubs.get(sel);
  };
  renderTopBar(container, options);
  return { html: container.innerHTML, stubs };
}

// Pause + Stop pair: stable ids, icon paths, accessible labels, and the
// power button's lighter-grey class separating it from Pause.
{
  let paused = 0;
  let stopped = 0;
  const { html, stubs } = render({
    title: 'Aurora',
    trailingButtons: [
      { id: 'top-bar-pause-btn', label: 'Pause', icon: new URL('./icons/pause-rockyroad.svg', import.meta.url).href, onClick: () => { paused++; } },
      { id: 'top-bar-stop-btn', label: 'Stop', icon: new URL('./icons/power-svgrepo-com.svg', import.meta.url).href, onClick: () => { stopped++; }, buttonClass: 'btn btn-icon top-bar-power-btn' },
    ],
  });
  assert.ok(html.includes('id="top-bar-pause-btn"'), 'pause button id rendered');
  assert.ok(html.includes('id="top-bar-stop-btn"'), 'stop button id rendered');
  assert.ok(html.includes('aria-label="Pause"'), 'icon-only pause keeps its label');
  assert.ok(html.includes('aria-label="Stop"'), 'icon-only stop keeps its label');
  assert.ok(html.includes('pause-rockyroad.svg'), 'pause glyph rendered');
  assert.ok(html.includes('power-svgrepo-com.svg'), 'power glyph rendered');
  assert.ok(html.includes('top-bar-power-btn'), 'power button reads lighter than pause');
  assert.ok(html.indexOf('top-bar-pause-btn') < html.indexOf('top-bar-stop-btn'), 'pause sits next to (before) power');
  stubs.get('#top-bar-pause-btn').listeners.click[0]();
  stubs.get('#top-bar-stop-btn').listeners.click[0]();
  assert.equal(paused, 1);
  assert.equal(stopped, 1);
}

// Resume state swaps the glyph and label, same id.
{
  const { html } = render({
    title: 'Aurora',
    trailingButtons: [
      { id: 'top-bar-pause-btn', label: 'Resume', icon: new URL('./icons/play-rockyroad.svg', import.meta.url).href, onClick: () => {} },
    ],
  });
  assert.ok(html.includes('aria-label="Resume"'), 'resume label rendered');
  assert.ok(html.includes('play-rockyroad.svg'), 'play glyph rendered');
}

// Busy pause renders native disabled.
{
  const { html } = render({
    title: 'Aurora',
    trailingButtons: [
      { id: 'top-bar-pause-btn', label: 'Pause', icon: new URL('./icons/pause-rockyroad.svg', import.meta.url).href, onClick: () => {}, disabled: true },
    ],
  });
  assert.ok(html.includes('disabled'), 'busy pause is disabled, not hidden');
}

// Legacy single trailingButton keeps its id, styling, and wiring.
{
  let n = 0;
  const { html, stubs } = render({
    title: 'Aurora',
    trailingButton: { label: 'Stop', icon: new URL('./icons/power-svgrepo-com.svg', import.meta.url).href, onClick: () => { n++; } },
  });
  assert.ok(html.includes('id="top-bar-trailing-btn"'), 'legacy id kept');
  assert.ok(html.includes('btn btn-secondary btn-icon'), 'legacy icon styling kept');
  stubs.get('#top-bar-trailing-btn').listeners.click[0]();
  assert.equal(n, 1);
}

// Text trailing button renders its label visibly with no aria-label.
{
  const { html } = render({
    title: 'Aurora',
    trailingButton: { label: 'Back soon', onClick: () => {} },
  });
  assert.ok(html.includes('>Back soon<'), 'text label visible');
  assert.ok(!html.includes('aria-label'), 'no aria-label for text buttons');
}

// No trailing buttons: no button markup in the trailing slot.
{
  const { html } = render({ title: 'Aurora' });
  assert.ok(!html.includes('<button type="button" class="btn'), 'no trailing button rendered');
}

console.log('topBar checks passed.');
