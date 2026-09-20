// .slider-input's fill: Chromium/WebKit have no native "already-filled"
// track pseudo-element (unlike Firefox's ::-moz-range-progress, handled in
// forms.css alone) -- accent-color used to paint it for free, but that same
// native rendering mode is what made a solid-white thumb impossible (Chrome
// only honors a ::-webkit-slider-thumb override once the host's own
// -webkit-appearance is reset away from native, which also turns off
// accent-color's fill; see Analysis/lessons/web-ui.md). This sets a CSS
// variable read by .slider-input::-webkit-slider-runnable-track's gradient
// instead, so a hard-color-stop background approximates the same fill.
function updateSliderFill(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const percent = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty('--slider-percent', `${percent}%`);
}

// Call once right after a .slider-input is inserted into the DOM -- paints
// the initial fill and keeps it in sync on every subsequent drag/keypress.
export function bindSliderFill(input) {
  updateSliderFill(input);
  input.addEventListener('input', () => updateSliderFill(input));
}
