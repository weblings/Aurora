// Tuning / Settings: exposes whichever mode's numeric knobs are currently
// active -- ~4 for video, ~11 for audio -- as a single scrollable column
// with plain section headings, not tabs (see Analysis/WebUI/WebUI_Design_1stPass.md's
// Tuning section: at this field count, tabs solve a scrolling problem that
// doesn't really exist, for a real interaction cost). Build-order step 13.
//
// `audioTargetSinkName` is deliberately NOT surfaced here even though the
// original spec text listed it alongside AudioEffectSettings -- it's a
// device identifier, not a tuning knob, and step 12 already gave it a real
// home (Mode+Device Select's own audio device field), through the same
// PUT /api/config endpoint. One editable surface per field, not two
// screens each holding a separately-stale copy.
//
// Save does not advance to a "done" phase the way OutputConnectScreen/
// ModeDeviceScreen do -- it saves in place and stays on this screen. Those
// two screens gate a one-shot decision (pair a bridge, pick a device); this
// one is meant for iterative adjustment (nudge a slider, listen, nudge
// again), so forcing a "Continue" click after every tweak would fight the
// screen's own job. Worth knowing this is genuinely different from every
// other real reload here, not free: `PipelineHost::reload()` (see each
// app's main.cpp) always calls `Pipeline::build()` fresh -- there is no
// settings-only update path -- so every Save here tears down and
// reconstructs the *entire* live pipeline (video/audio input included),
// not just applies new numbers to an already-running one. That's the real
// reason this screen batches edits behind an explicit Save instead of
// applying every slider-drag tick live: a reload per drag frame would
// rebuild the whole pipeline dozens of times a second.
//
// `showContinue` (step 18's first-run bootstrap only) adds a separate
// Continue button next to Save, since this screen's own Save never
// navigates away -- the boot chain needs an explicit forward action here
// that Dashboard-driven hub visits don't.
import { renderTopBar } from '../topBar.js';
import { Dropdown } from '../Dropdown.js';
import { sliderGroupHtml, wireSliderGroup } from '../TuningSliderGroup.js';

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

export class TuningScreen {
  constructor(app, { onComplete, onBack, showBack = true, showContinue = false }) {
    this.app = app;
    this.onComplete = onComplete;
    this.onBack = onBack ?? onComplete;
    this.showBack = showBack;
    this.showContinue = showContinue;
    this.mode = 'video';
    this.values = {};
    this.fixedHueEnabled = false;
    this.error = null;
    this.success = false;
    this.dropdown = null;
  }

  async mount(container) {
    this.container = container;
    container.innerHTML = `
      <div class="top-bar-slot"></div>
      <div class="tn-body"></div>
    `;

    const body = container.querySelector('.tn-body');
    body.innerHTML = `<p class="status-text">Loading…</p>`;

    let config;
    try {
      config = await (await fetch('/api/config')).json();
    } catch {
      renderTopBar(container.querySelector('.top-bar-slot'), {
        title: 'Settings',
        showBack: this.showBack,
        onBack: () => this.onBack(),
        onSettings: () => this.app.openSettings(),
      });
      body.innerHTML = `<p class="status-text status-text-error">⚠ Could not reach the daemon.</p>`;
      return;
    }

    this.mode = (!config.activeInputName && config.activeAudioInputName) ? 'audio' : 'video';
    this.values = { ...config };
    this.fixedHueEnabled = (config.audioFixedAnchorHue ?? -1) >= 0;

    renderTopBar(container.querySelector('.top-bar-slot'), {
      title: `Settings — ${this.mode === 'audio' ? 'Audio' : 'Video'}`,
      showBack: this.showBack,
      onBack: () => this.onBack(),
      onSettings: () => this.app.openSettings(),
    });

    this._render();
  }

  unmount() {
    this.dropdown?.destroy();
    this.dropdown = null;
  }

  _render() {
    const body = this.container.querySelector('.tn-body');
    this.dropdown?.destroy();
    this.dropdown = null;

    const errorHtml = this.error ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.error)}</p>` : '';
    const successHtml = this.success ? `<p class="status-text status-text-success">✓ Saved.</p>` : '';

    body.innerHTML = `
      <div class="tn-fields"></div>
      ${errorHtml}
      ${successHtml}
      <div class="tuning-actions">
        <button type="button" class="btn btn-primary" id="tn-save">Save</button>
        ${this.showContinue ? '<button type="button" class="btn btn-secondary" id="tn-continue">Continue</button>' : ''}
      </div>
    `;

    const fields = body.querySelector('.tn-fields');
    if (this.mode === 'video') this._renderVideoFields(fields);
    else this._renderAudioFields(fields);

    body.querySelector('#tn-save').addEventListener('click', (e) => this._save(e.currentTarget));
    if (this.showContinue) {
      body.querySelector('#tn-continue').addEventListener('click', () => this.onComplete());
    }
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
