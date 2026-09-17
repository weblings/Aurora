// Tuning's full field set (~4 video / ~11 audio), extracted from the now-
// deleted TuningScreen.js so the accordion Dashboard's collapsed Tuning
// section (Analysis/WebUI/WebUI_Design_2ndPass.md, step 20) can own it
// directly -- TuningScreen had no other consumer left once step 18 dropped
// it from onboarding and step 20 folds it into the Dashboard, so this is a
// straight migration of its field/save logic, not a reuse-driven split.
//
// Keeps its own explicit Save button rather than PUTting on every edit the
// way Zone Mapping's canvas/toggles do: PipelineHost::reload() (each app's
// main.cpp) has no settings-only update path, so every save here tears down
// and reconstructs the *entire* live pipeline -- a per-drag-tick PUT would
// rebuild it dozens of times a second. See the original TuningScreen.js
// history for the full reasoning; unchanged here.
import { Dropdown } from './Dropdown.js';
import { sliderGroupHtml, wireSliderGroup } from './TuningSliderGroup.js';

const INTERPOLATIONS = ['Nearest', 'Cubic', 'Area'];

// [key, label, min, max, step, unit]
const TRANSITION_SMOOTHING_SLIDER = [
  ['transitionSmoothing', 'Transition smoothing', 0, 0.97, 0.01, ''],
];
const RESPONSE_SPEED_SLIDERS = [
  ['audioBounceSmoothTime', 'Bounce smooth time', 0.05, 2, 0.01, 's'],
  ['audioBrightnessSmoothTime', 'Brightness smooth time', 0.05, 2, 0.01, 's'],
  ['audioDriftBaseRateDegPerSec', 'Drift base rate', 0, 60, 1, '°/s'],
];
const COLOR_CHARACTER_SLIDERS = [
  ['audioVibrancySaturation', 'Vibrancy saturation', 0, 1, 0.01, ''],
  ['audioVibrancyValue', 'Vibrancy value', 0, 1, 0.01, ''],
];
const FIXED_HUE_SLIDER = [
  ['audioFixedAnchorHue', 'Fixed hue', 0, 360, 1, '°'],
];
const SENSITIVITY_SLIDERS = [
  ['audioDynamismFloor', 'Dynamism floor', 0, 1, 0.01, ''],
  ['audioCentroidStrength', 'Centroid strength', 0, 1, 0.01, ''],
  ['audioReferenceRms', 'Reference RMS', 0.05, 1, 0.01, ''],
  ['audioBrightnessFloor', 'Brightness floor', 0, 1, 0.01, ''],
  ['audioCentroidRangeHz', 'Centroid range', 100, 8000, 10, 'Hz'],
];

export class TuningFields {
  // values: the full /api/config response -- the caller (DashboardScreen)
  // already fetches this for its own mode toggle, so this never fetches on
  // its own (unlike every fetch+render component elsewhere in this app --
  // there's simply nothing left for it to fetch that the caller doesn't
  // already have).
  constructor(container, { mode, values }) {
    this.container = container;
    this.mode = mode;
    this.values = { ...values };
    this.fixedHueEnabled = (values.audioFixedAnchorHue ?? -1) >= 0;
    this.error = null;
    this.success = false;
    this.dropdown = null;
    this._render();
  }

  destroy() {
    this.dropdown?.destroy();
    this.dropdown = null;
  }

  _render() {
    this.dropdown?.destroy();
    this.dropdown = null;

    const errorHtml = this.error ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.error)}</p>` : '';
    const successHtml = this.success ? `<p class="status-text status-text-success">✓ Saved.</p>` : '';

    this.container.innerHTML = `
      <div class="tn-fields"></div>
      ${errorHtml}
      ${successHtml}
      <div class="tuning-actions">
        <button type="button" class="btn btn-primary" id="tn-save">Save</button>
      </div>
    `;

    const fields = this.container.querySelector('.tn-fields');
    if (this.mode === 'video') this._renderVideoFields(fields);
    else this._renderAudioFields(fields);

    this.container.querySelector('#tn-save').addEventListener('click', (e) => this._save(e.currentTarget));
  }

  _renderVideoFields(container) {
    container.innerHTML = `
      <div class="tuning-grid">
        <div class="field">
          <label class="field-label" for="tn-refresh-rate">Refresh rate (Hz)</label>
          <input id="tn-refresh-rate" class="text-input" type="number" min="1" step="1" />
        </div>
        <div class="field">
          <label class="field-label" for="tn-subsample-width">Subsample width (px) — 0 = auto</label>
          <input id="tn-subsample-width" class="text-input" type="number" min="0" step="1" />
        </div>
        <div class="field">
          <label class="field-label" id="tn-interp-label">Interpolation</label>
          <div id="tn-interp-dropdown-slot"></div>
        </div>
        ${sliderGroupHtml(TRANSITION_SMOOTHING_SLIDER, this.values)}
      </div>
    `;

    const refreshInput = container.querySelector('#tn-refresh-rate');
    refreshInput.value = this.values.refreshRate ?? 0;
    refreshInput.addEventListener('input', () => { this.values.refreshRate = refreshInput.value; });

    const subsampleInput = container.querySelector('#tn-subsample-width');
    subsampleInput.value = this.values.subsampleWidth ?? 0;
    subsampleInput.addEventListener('input', () => { this.values.subsampleWidth = subsampleInput.value; });

    const slot = container.querySelector('#tn-interp-dropdown-slot');
    const current = INTERPOLATIONS.includes(this.values.interpolation) ? this.values.interpolation : 'Area';
    this.dropdown = new Dropdown(
      slot,
      current,
      (value) => { this.values.interpolation = value; },
      { labelId: 'tn-interp-label', fill: true },
    );
    this.dropdown.setOptions(INTERPOLATIONS.map((name) => ({ label: name, value: name, selected: name === current })));

    wireSliderGroup(container, TRANSITION_SMOOTHING_SLIDER, this.values);
  }

  _renderAudioFields(container) {
    container.innerHTML = `
      <h2 class="section-heading">Response speed</h2>
      <div class="tuning-grid">
        ${sliderGroupHtml(RESPONSE_SPEED_SLIDERS, this.values)}
      </div>

      <h2 class="section-heading">Color character</h2>
      <div class="tuning-grid">
        ${sliderGroupHtml(COLOR_CHARACTER_SLIDERS, this.values)}
        <div class="tuning-checkbox-row">
          <label class="toggle-row">
            <span class="toggle-row-label">Use fixed hue</span>
            <span class="toggle-switch">
              <input type="checkbox" id="tn-fixed-hue-toggle" ${this.fixedHueEnabled ? 'checked' : ''} />
              <span class="toggle-knob"></span>
            </span>
          </label>
        </div>
        ${this.fixedHueEnabled ? sliderGroupHtml(FIXED_HUE_SLIDER, this.values) : ''}
      </div>

      <h2 class="section-heading">Sensitivity</h2>
      <div class="tuning-grid">
        ${sliderGroupHtml(SENSITIVITY_SLIDERS, this.values)}
      </div>
    `;

    wireSliderGroup(container, RESPONSE_SPEED_SLIDERS, this.values);
    wireSliderGroup(container, COLOR_CHARACTER_SLIDERS, this.values);
    wireSliderGroup(container, SENSITIVITY_SLIDERS, this.values);
    if (this.fixedHueEnabled) wireSliderGroup(container, FIXED_HUE_SLIDER, this.values);

    container.querySelector('#tn-fixed-hue-toggle').addEventListener('change', (e) => {
      this.fixedHueEnabled = e.currentTarget.checked;
      this.values.audioFixedAnchorHue = this.fixedHueEnabled ? (this.values.audioFixedAnchorHue >= 0 ? this.values.audioFixedAnchorHue : 0) : -1;
      this._render();
    });
  }

  async _save(button) {
    button.disabled = true;
    this.error = null;
    this.success = false;

    const patch = this.mode === 'video'
      ? {
          refreshRate: Number(this.values.refreshRate),
          subsampleWidth: Number(this.values.subsampleWidth),
          interpolation: this.values.interpolation,
          transitionSmoothing: Number(this.values.transitionSmoothing),
        }
      : {
          audioBounceSmoothTime: Number(this.values.audioBounceSmoothTime),
          audioBrightnessSmoothTime: Number(this.values.audioBrightnessSmoothTime),
          audioDriftBaseRateDegPerSec: Number(this.values.audioDriftBaseRateDegPerSec),
          audioVibrancySaturation: Number(this.values.audioVibrancySaturation),
          audioVibrancyValue: Number(this.values.audioVibrancyValue),
          audioDynamismFloor: Number(this.values.audioDynamismFloor),
          audioCentroidStrength: Number(this.values.audioCentroidStrength),
          audioReferenceRms: Number(this.values.audioReferenceRms),
          audioBrightnessFloor: Number(this.values.audioBrightnessFloor),
          audioCentroidRangeHz: Number(this.values.audioCentroidRangeHz),
          audioFixedAnchorHue: this.fixedHueEnabled ? Number(this.values.audioFixedAnchorHue) : -1,
        };

    try {
      const result = await (await fetch('/api/config', {
        method: 'PUT',
        body: JSON.stringify(patch),
      })).json();

      if (!result.succeeded) {
        this.error = "Couldn't save settings.";
      } else if (result.reloadError) {
        this.error = `Saved, but couldn't apply it live: ${result.reloadError}`;
      } else {
        this.success = true;
      }
    } catch {
      this.error = "Couldn't reach the daemon.";
    }

    button.disabled = false;
    this._render();
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
