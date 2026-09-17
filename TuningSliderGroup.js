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
export function sliderGroupHtml(sliders, values) {
  return sliders.map(([key, label, min, max, step, unit]) => sliderFieldHtml(key, label, min, max, step, unit, values)).join('');
}

// Wires every slider in the group, found by id within container -- safe to
// call after inserting sliderGroupHtml()'s output anywhere in the DOM,
// including mixed in with other content in the same container.
export function wireSliderGroup(container, sliders, values) {
  for (const [key, , , , , unit] of sliders) wireSlider(container, key, unit, values);
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

function wireSlider(container, key, unit, values) {
  const input = container.querySelector(`#tn-${key}`);
  const readout = container.querySelector(`#tn-${key}-val`);
  const step = input.step;
  input.addEventListener('input', () => {
    values[key] = input.value;
    readout.textContent = `${formatSliderValue(input.value, step)}${unit}`;
  });
}

function formatSliderValue(value, step) {
  const decimals = step && String(step).includes('.') ? String(step).split('.')[1].length : 0;
  return Number(value).toFixed(decimals);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
