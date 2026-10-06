// Tuning's full field set (~4 video / ~11 audio), extracted from the now-
// deleted TuningScreen.js so the accordion Dashboard's collapsed Tuning
// section (docs/WebUI/WebUI_Design_2ndPass.md, step 20) can own it
// directly -- TuningScreen had no other consumer left once step 18 dropped
// it from onboarding and step 20 folds it into the Dashboard, so this is a
// straight migration of its field/save logic, not a reuse-driven split.
//
// Used to keep its own explicit Save button instead of PUTting on every
// edit the way Zone Mapping's canvas/toggles do -- the Dashboard ended up
// with two sections behaving oppositely (Zone Mapping live, Tuning
// Save-gated) for a real reason (PipelineHost::reload(), each app's
// main.cpp, had no settings-only update path -- every save here tore down
// and reconstructed the *entire* live pipeline, including a real Hue DTLS
// handshake measured elsewhere at 1-3+ seconds), not an oversight. Fixed by
// making every field commit on its own natural gesture-end signal instead
// (a slider's drag-release/keyup, a dropdown/checkbox's own change) rather
// than trying to make reload() itself cheaper -- see docs/lessons/
// web-ui.md's "gesture-end commit signal" entry. No more Save button or
// manual gate anywhere on this screen; every option behaves the same way
// now, matching Zone Mapping's own model.
//
// Since Aurora-c0g the server applies tuning-only saves live (no reload),
// so the commit-on-gesture-end rule here is no longer forced by cost;
// whether to PUT while dragging is an open follow-up, not decided.
import { Dropdown } from './Dropdown.js';
import { applyTooltip, descriptorsSettled, ensureTooltips, paramFor } from './Tooltips.js';
import { sliderGroupHtml, sliderTooltipKey, wireSliderGroup } from './TuningSliderGroup.js';
import { AUTO_MONITOR_VALUE } from './DeviceField.js';
import { subsampleCandidates } from './SubsampleCandidates.js';
import { DAEMON_UNREACHABLE } from './messages.js';

const INTERPOLATIONS = ['Nearest', 'Cubic', 'Area'];

// A curated preset list, not every integer -- refresh rate is a genuine
// performance/tuning knob (unlike subsample width, whose "clean" divisor-
// based candidates are objectively the better choices), so this is a
// convenience list of common real display rates, not an exhaustive one.
// Falls back to whichever preset is numerically closest for a value that
// doesn't exactly match one (e.g. a detected 59Hz), rather than a fixed
// default -- see _closestRefreshRate.
const REFRESH_RATE_PRESETS = [30, 60, 75, 90, 120, 144, 165, 240];

function _closestRefreshRate(value) {
  return REFRESH_RATE_PRESETS.reduce((best, candidate) => (
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best
  ));
}

function _resolveMonitor(monitors, selectedMonitorName) {
  if (!monitors.length) return null;
  if (selectedMonitorName === AUTO_MONITOR_VALUE) return monitors.find((m) => m.isPrimary) ?? monitors[0];
  return monitors.find((m) => m.name === selectedMonitorName) ?? monitors[0];
}

// Layout only: which settings each section shows, in order. Each slider's
// label, range, step and unit come from the backend's param schema
// (/api/descriptors, Aurora-ta5) -- the same definition Config's setters
// clamp to, so the two can't drift.
const TRANSITION_SMOOTHING_KEYS = ['transitionSmoothing'];
const RESPONSE_SPEED_KEYS = ['audioBounceSmoothTime', 'audioBrightnessSmoothTime', 'audioDriftBaseRateDegPerSec'];
const COLOR_CHARACTER_KEYS = ['audioVibrancySaturation', 'audioVibrancyValue'];
const FIXED_HUE_KEYS = ['audioFixedAnchorHue'];
const SENSITIVITY_KEYS = ['audioDynamismFloor', 'audioCentroidStrength', 'audioReferenceRms', 'audioBrightnessFloor', 'audioCentroidRangeHz'];

// [key, label, min, max, step, unit] tuples for sliderGroupHtml, from the
// param schema. A key without a schema (descriptors not loaded yet, or a
// failed fetch) is skipped rather than rendered with invented numbers.
export function slidersFromParams(configKeys, lookup = paramFor) {
  const sliders = [];
  for (const key of configKeys) {
    const param = lookup(sliderTooltipKey(key));
    if (param) sliders.push([key, param.label, param.min, param.max, param.step, param.unit]);
  }
  return sliders;
}

export class TuningFields {
  // values: the full /api/config response -- the caller (DashboardScreen)
  // already fetches this for its own mode toggle, so this never fetches on
  // its own (unlike every fetch+render component elsewhere in this app --
  // there's simply nothing left for it to fetch that the caller doesn't
  // already have). usesVideoInput/usesAudioInput: what runs (Aurora-kea).
  constructor(container, { usesVideoInput = true, usesAudioInput = false, values, monitors = [], selectedMonitorName = AUTO_MONITOR_VALUE }) {
    this.container = container;
    this.usesVideoInput = usesVideoInput;
    this.usesAudioInput = usesAudioInput;
    // Still one of two field tables; Aurora-jpq2 replaces them with the
    // graph's controls list. Video wins when both run.
    this.fieldSet = (usesVideoInput || !usesAudioInput) ? 'video' : 'audio';
    this.values = { ...values };
    this.monitors = monitors;
    this.selectedMonitorName = selectedMonitorName;
    this.fixedHueEnabled = (values.audioFixedAnchorHue ?? -1) >= 0;
    this.error = null;
    this.dropdowns = [];
    this._render();
  }

  destroy() {
    this._destroyed = true;
    for (const dropdown of this.dropdowns) dropdown.destroy();
    this.dropdowns = [];
  }

  _render() {
    for (const dropdown of this.dropdowns) dropdown.destroy();
    this.dropdowns = [];

    // Sliders need the param schema. app.js fires ensureTooltips() at boot,
    // so it has almost always settled by now; if not, render what we can
    // and re-render once it lands.
    if (!descriptorsSettled() && !this._awaitingParams) {
      this._awaitingParams = true;
      ensureTooltips().then(() => {
        this._awaitingParams = false;
        if (!this._destroyed) this._render();
      });
    }
    const keys = this.fieldSet === 'video'
      ? TRANSITION_SMOOTHING_KEYS
      : [...RESPONSE_SPEED_KEYS, ...COLOR_CHARACTER_KEYS, ...FIXED_HUE_KEYS, ...SENSITIVITY_KEYS];
    const rangesMissing = descriptorsSettled() && slidersFromParams(keys).length < keys.length;
    const message = this.error ?? (rangesMissing ? "Couldn't load slider ranges from the daemon." : null);
    const errorHtml = message ? `<p class="status-text status-text-error">⚠ ${escapeHtml(message)}</p>` : '';

    this.container.innerHTML = `
      <div class="tn-fields"></div>
      ${errorHtml}
    `;

    const fields = this.container.querySelector('.tn-fields');
    if (this.fieldSet === 'video') this._renderVideoFields(fields);
    else this._renderAudioFields(fields);
  }

  _renderVideoFields(container) {
    container.innerHTML = `
      <div class="tuning-grid">
        <div class="field">
          <label class="field-label" id="tn-refresh-label">Refresh rate</label>
          <div id="tn-refresh-dropdown-slot"></div>
        </div>
        <div class="field">
          <label class="field-label" id="tn-subsample-label">Subsample width</label>
          <div id="tn-subsample-dropdown-slot"></div>
        </div>
        <div class="field">
          <label class="field-label" id="tn-interp-label">Interpolation</label>
          <div id="tn-interp-dropdown-slot"></div>
        </div>
        ${sliderGroupHtml(slidersFromParams(TRANSITION_SMOOTHING_KEYS), this.values, { controlBand: true })}
      </div>
    `;

    // Presets, not free entry -- see REFRESH_RATE_PRESETS/_closestRefreshRate
    // above for why an unmatched detected value snaps to the nearest preset
    // for *display* only; nothing is persisted until the dropdown is
    // actually committed.
    const refreshSlot = container.querySelector('#tn-refresh-dropdown-slot');
    const currentRefresh = Number(this.values.refreshRate) || REFRESH_RATE_PRESETS[0];
    const refreshValue = REFRESH_RATE_PRESETS.includes(currentRefresh) ? currentRefresh : _closestRefreshRate(currentRefresh);
    const refreshDropdown = new Dropdown(
      refreshSlot,
      String(refreshValue),
      (value) => { this.values.refreshRate = Number(value); this._autoSave(); },
      { labelId: 'tn-refresh-label', fill: true, tooltipKey: 'video.refreshRate' },
    );
    refreshDropdown.setOptions(REFRESH_RATE_PRESETS.map((hz) => (
      { label: `${hz} Hz`, value: String(hz), selected: hz === refreshValue }
    )));
    this.dropdowns.push(refreshDropdown);

    // Candidates depend on the currently selected monitor's real resolution
    // (subsampleCandidates is a pure function of width/height -- see
    // SubsampleCandidates.js) -- "Auto" (0) always leads the list, matching
    // the backend's own sentinel for "let Orchestrator::init() pick one."
    const subsampleSlot = container.querySelector('#tn-subsample-dropdown-slot');
    const monitor = _resolveMonitor(this.monitors, this.selectedMonitorName);
    const candidates = monitor ? subsampleCandidates(monitor.width, monitor.height) : [];
    const currentSubsample = Number(this.values.subsampleWidth) || 0;
    const subsampleOptions = [
      { label: 'Auto', value: '0' },
      ...candidates.map((c) => ({ label: `${c.width}px`, value: String(c.width) })),
    ];
    const subsampleValue = subsampleOptions.some((o) => Number(o.value) === currentSubsample) ? currentSubsample : 0;
    const subsampleDropdown = new Dropdown(
      subsampleSlot,
      String(subsampleValue),
      (value) => { this.values.subsampleWidth = Number(value); this._autoSave(); },
      { labelId: 'tn-subsample-label', fill: true, tooltipKey: 'video.subsampleWidth' },
    );
    subsampleDropdown.setOptions(subsampleOptions.map((o) => ({ ...o, selected: Number(o.value) === subsampleValue })));
    this.dropdowns.push(subsampleDropdown);

    const interpSlot = container.querySelector('#tn-interp-dropdown-slot');
    const currentInterp = INTERPOLATIONS.includes(this.values.interpolation) ? this.values.interpolation : 'Area';
    const interpDropdown = new Dropdown(
      interpSlot,
      currentInterp,
      (value) => { this.values.interpolation = value; this._autoSave(); },
      { labelId: 'tn-interp-label', fill: true, tooltipKey: 'video.interpolation' },
    );
    interpDropdown.setOptions(INTERPOLATIONS.map((name) => ({ label: name, value: name, selected: name === currentInterp })));
    this.dropdowns.push(interpDropdown);

    wireSliderGroup(container, slidersFromParams(TRANSITION_SMOOTHING_KEYS), this.values, () => this._autoSave());
  }

  _renderAudioFields(container) {
    const responseSpeed = slidersFromParams(RESPONSE_SPEED_KEYS);
    const colorCharacter = slidersFromParams(COLOR_CHARACTER_KEYS);
    const fixedHue = slidersFromParams(FIXED_HUE_KEYS);
    const sensitivity = slidersFromParams(SENSITIVITY_KEYS);

    container.innerHTML = `
      <h2 class="section-heading">Response speed</h2>
      <div class="tuning-grid">
        ${sliderGroupHtml(responseSpeed, this.values)}
      </div>

      <h2 class="section-heading">Color character</h2>
      <div class="tuning-grid">
        ${sliderGroupHtml(colorCharacter, this.values)}
        <div class="tuning-checkbox-row">
          <label class="toggle-row">
            <span class="toggle-row-label">Use fixed hue</span>
            <span class="toggle-switch">
              <input type="checkbox" id="tn-fixed-hue-toggle" ${this.fixedHueEnabled ? 'checked' : ''} />
              <span class="toggle-knob"></span>
            </span>
          </label>
        </div>
        ${this.fixedHueEnabled ? sliderGroupHtml(fixedHue, this.values) : ''}
      </div>

      <h2 class="section-heading">Sensitivity</h2>
      <div class="tuning-grid">
        ${sliderGroupHtml(sensitivity, this.values)}
      </div>
    `;

    wireSliderGroup(container, responseSpeed, this.values, () => this._autoSave());
    wireSliderGroup(container, colorCharacter, this.values, () => this._autoSave());
    wireSliderGroup(container, sensitivity, this.values, () => this._autoSave());
    if (this.fixedHueEnabled) wireSliderGroup(container, fixedHue, this.values, () => this._autoSave());
    applyTooltip(container.querySelector('label.tuning-checkbox-row'), 'audio.fixedHueEnabled');

    container.querySelector('#tn-fixed-hue-toggle').addEventListener('change', (e) => {
      this.fixedHueEnabled = e.currentTarget.checked;
      this.values.audioFixedAnchorHue = this.fixedHueEnabled ? (this.values.audioFixedAnchorHue >= 0 ? this.values.audioFixedAnchorHue : 0) : -1;
      this._render();
      this._autoSave();
    });
  }

  // Every field auto-saves on its own commit now (sliders on drag-release/
  // keyup, dropdowns and the checkbox on change) -- there's no longer a
  // manual Save button gating any of them. Coalesces overlapping calls the
  // same way ZonePatchQueue does for zone edits: at most one save in flight,
  // always eventually sending whatever the values were at the *last* commit,
  // never a queued backlog of intermediate ones.
  async _autoSave() {
    if (this._saving) { this._resaveQueued = true; return; }
    this._saving = true;
    await this._commit();
    this._saving = false;
    if (this._resaveQueued) {
      this._resaveQueued = false;
      this._autoSave();
    }
  }

  async _commit() {
    this.error = null;

    // Saves the settings of each running input, both when both run.
    const patch = {
      ...(this.usesVideoInput || !this.usesAudioInput ? {
          refreshRate: Number(this.values.refreshRate),
          subsampleWidth: Number(this.values.subsampleWidth),
          interpolation: this.values.interpolation,
          transitionSmoothing: Number(this.values.transitionSmoothing),
        } : {}),
      ...(this.usesAudioInput ? {
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
        } : {}),
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
      }
    } catch {
      this.error = DAEMON_UNREACHABLE;
    }

    this._render();
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
