// Reusable "labeled group of sliders" building block, extracted out of
// TuningScreen.js's three near-identical slider-rendering loops (video's
// lone transitionSmoothing slider, and audio's Response speed/Color
// character/Sensitivity sections) so the Dashboard's own collapsed Tuning
// accordion section (Analysis/WebUI/WebUI_Design_2ndPass.md) can reuse the
// same slider markup + wiring. Pure functions, not a mounted component --
// callers own their own heading/wrapping-grid markup, since one section
// (Color character) interleaves a slider group with other, non-slider
// content inside the same CSS grid, which a component that unconditionally
// owns its whole container couldn't accommodate without changing that
// section's layout.
import { bindSliderFill } from './SliderFill.js';

export function sliderGroupHtml(sliders, values) {
  return sliders.map(([key, label, min, max, step, unit]) => sliderFieldHtml(key, label, min, max, step, unit, values)).join('');
}

// Wires every slider in the group, found by id within container -- safe to
// call after inserting sliderGroupHtml()'s output anywhere in the DOM,
// including mixed in with other content in the same container. onCommit
// (optional) fires once per completed interaction -- see wireSlider.
export function wireSliderGroup(container, sliders, values, onCommit) {
  for (const [key, , , , , unit] of sliders) wireSlider(container, key, unit, values, onCommit);
}

function sliderFieldHtml(key, label, min, max, step, unit, values) {
  const value = values[key] ?? min;
  return `
    <div class="field">
      <div class="slider-field-header">
        <label class="field-label" for="tn-${key}">${escapeHtml(label)}</label>
        <span class="slider-value" id="tn-${key}-val">${formatSliderValue(value, step)}${unit}</span>
      </div>
      <input type="range" class="slider-input" id="tn-${key}" min="${min}" max="${max}" step="${step}" value="${value}" />
    </div>
  `;
}

// onCommit fires once per completed interaction, not per tick -- a mouse/
// touch drag's own native `change` (fires once, on release) for pointer
// input. Keyboard input needs its own tracking rather than reusing `change`
// the same way: arrow-key input fires `change` on every discrete step,
// including every OS key-repeat while a key is held, so gating on `change`
// alone would still fire once per repeat during a hold. isKeyHeld suppresses
// those in-hold `change` events and commits only once, on the keyup that
// actually ends the hold -- keydown/keyup give an exact "is this key
// currently down" signal, the same kind of start/end-of-gesture signal
// pointerdown/pointerup already give a mouse drag, so no arbitrary delay is
// needed for either input method.
function wireSlider(container, key, unit, values, onCommit) {
  const input = container.querySelector(`#tn-${key}`);
  const readout = container.querySelector(`#tn-${key}-val`);
  const step = input.step;
  let isKeyHeld = false;

  bindSliderFill(input);

  input.addEventListener('input', () => {
    values[key] = input.value;
    readout.textContent = `${formatSliderValue(input.value, step)}${unit}`;
  });

  if (!onCommit) return;

  input.addEventListener('keydown', () => { isKeyHeld = true; });
  input.addEventListener('keyup', () => { isKeyHeld = false; onCommit(); });
  // Safety net, not the expected path -- if focus leaves mid-hold some other
  // way (e.g. a browser shortcut swallows the keyup), don't leave isKeyHeld
  // stuck true forever suppressing every future `change` on this slider.
  input.addEventListener('blur', () => { isKeyHeld = false; });
  input.addEventListener('change', () => { if (!isKeyHeld) onCommit(); });
}

function formatSliderValue(value, step) {
  const decimals = step && String(step).includes('.') ? String(step).split('.')[1].length : 0;
  return Number(value).toFixed(decimals);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
