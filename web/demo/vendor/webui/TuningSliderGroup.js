// Reusable "labeled group of sliders" building block, extracted out of
// TuningScreen.js's three near-identical slider-rendering loops (video's
// lone transitionSmoothing slider, and audio's Response speed/Color
// character/Sensitivity sections) so the Dashboard's own collapsed Tuning
// accordion section (docs/WebUI/WebUI_Design_2ndPass.md) can reuse the
// same slider markup + wiring. Pure functions, not a mounted component --
// callers own their own heading/wrapping-grid markup, since one section
// (Color character) interleaves a slider group with other, non-slider
// content inside the same CSS grid, which a component that unconditionally
// owns its whole container couldn't accommodate without changing that
// section's layout.
import { bindSliderFill } from './SliderFill.js';
import { tooltipFor } from './Tooltips.js';

// controlBand: wraps the slider input in a fixed-height, vertically-centered
// band matching a taller neighbor in the same grid row (e.g. a dropdown) --
// same technique as ZoneCanvas.js's own .zm-control-band. Opt-in and off by
// default: it's only needed where a slider actually shares a row with
// something taller (video Tuning's Transition smoothing, next to the
// Interpolation dropdown); wrapping every slider this way would roughly
// double the field height of every slider-only row (Audio's) for no
// visual benefit.
export function sliderGroupHtml(sliders, values, { controlBand = false } = {}) {
  return sliders.map(([key, label, min, max, step, unit]) => sliderFieldHtml(key, label, min, max, step, unit, values, controlBand)).join('');
}

// Wires every slider in the group, found by id within container -- safe to
// call after inserting sliderGroupHtml()'s output anywhere in the DOM,
// including mixed in with other content in the same container. onCommit
// (optional) fires once per completed interaction -- see wireSlider.
// disabled: not writable, so the slider shows its value and takes no input.
// Returns a function that unmounts any slider islands; call it before the container is rebuilt.
export function wireSliderGroup(container, sliders, values, onCommit, { disabled = false } = {}) {
  const mountSlider = globalThis.auroraIslands?.mountSlider;
  const unmounts = [];
  for (const [key, label, min, max, step, unit] of sliders) {
    const slot = mountSlider && container.querySelector(`#tn-${key}-slot`);
    if (slot) unmounts.push(mountSliderIsland(mountSlider, slot, { key, label, min, max, step, unit }, values, onCommit, disabled));
    else wireSlider(container, key, unit, values, onCommit, disabled);
  }
  return () => unmounts.forEach((unmount) => unmount());
}

// The island has no unit readout, so the unit joins the label.
function mountSliderIsland(mountSlider, slot, { key, label, min, max, step, unit }, values, onCommit, disabled) {
  const props = () => ({
    label: unit ? `${label} (${unit})` : label,
    value: Number(values[key] ?? min),
    min, max, step: Number(step),
    isDisabled: disabled,
    onChange: (v) => { values[key] = String(v); live.update(props()); },
    onChangeEnd: onCommit ? () => onCommit() : undefined,
  });
  const live = mountSlider(slot, props());
  return live.unmount;
}

// Descriptor key from the slider's config key: `audio*` settings live
// under `audio.*`, everything else in Tuning is video-pipeline owned
// (`video.*`) -- mirrors ControlDescriptorTables' layer split without a
// parallel table to keep in sync. Keys both the tooltip and the slider's
// param schema (TuningFields' slidersFromParams).
export function sliderTooltipKey(configKey) {
  if (configKey.startsWith('audio')) {
    return `audio.${configKey.charAt(5).toLowerCase()}${configKey.slice(6)}`;
  }
  return `video.${configKey}`;
}

function sliderFieldHtml(key, label, min, max, step, unit, values, controlBand) {
  const value = values[key] ?? min;
  const tip = tooltipFor(sliderTooltipKey(key));
  // The Slider island draws its own label, value and track into this slot (Aurora-4nqt.7).
  if (globalThis.auroraIslands?.mountSlider) {
    return `<div class="field slider-island-slot" id="tn-${key}-slot"${tip ? ` title="${escapeHtml(tip)}"` : ''}></div>`;
  }
  const inputHtml = `<input type="range" class="slider-input" id="tn-${key}" min="${min}" max="${max}" step="${step}" value="${value}" />`;
  return `
    <div class="field"${tip ? ` title="${escapeHtml(tip)}"` : ''}>
      <div class="slider-field-header">
        <label class="field-label" for="tn-${key}">${escapeHtml(label)}</label>
        <span class="slider-value" id="tn-${key}-val">${formatSliderValue(value, step)}${unit}</span>
      </div>
      ${controlBand ? `<div class="slider-control-band">${inputHtml}</div>` : inputHtml}
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
function wireSlider(container, key, unit, values, onCommit, disabled = false) {
  const input = container.querySelector(`#tn-${key}`);
  const readout = container.querySelector(`#tn-${key}-val`);
  const step = input.step;
  let isKeyHeld = false;

  bindSliderFill(input);
  if (disabled) input.disabled = true;

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
