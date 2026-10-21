// Tuning's fields. The list comes from the running graph's `controls`
// (Aurora-id8j.10, see TuningControls.js). Each slider's label, range, step and
// unit come from the node registry's param schema, the same definition Config's
// setters clamp to. Refresh rate is an app setting, not a node param, so video
// keeps it as a fixed row.
//
// Every field commits on its own gesture-end signal (a slider's drag-release/
// keyup, a dropdown/checkbox's change) with no Save button -- see docs/lessons/
// web-ui.md's "gesture-end commit signal" entry. The server applies tuning-only
// saves live (Aurora-c0g); whether to PUT while dragging is an open follow-up.
import { Dropdown } from './Dropdown.js';
import { applyTooltip } from './Tooltips.js';
import { sliderGroupHtml, sliderTooltipKey, wireSliderGroup } from './TuningSliderGroup.js';
import { fetchTuningGraph, groupBySection, isCustomEffect, resolveControls } from './TuningControls.js';
import { AUTO_MONITOR_VALUE } from './DeviceField.js';
import { subsampleCandidates } from './SubsampleCandidates.js';
import { DAEMON_UNREACHABLE } from './messages.js';

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

// The key a control's value lives under: its PUT /api/config key, else its
// node-param id (read-only, no write path).
export function controlKey(control) {
  return control.configKey ?? control.id;
}

// [key, label, min, max, step, unit] tuples for sliderGroupHtml.
export function slidersFromControls(controls) {
  return controls.map((c) => [controlKey(c), c.label, c.min, c.max, c.step, c.unit]);
}

// The /api/config patch for the rendered controls. Only config-bound controls
// are sent. An optional control switched off is sent as -1 (Config's "unset").
export function buildPatch(controls, values, optionalOn, { includeRefreshRate }) {
  const patch = includeRefreshRate ? { refreshRate: Number(values.refreshRate) } : {};
  for (const control of controls) {
    if (!control.configKey) continue;
    const value = values[control.configKey];
    if (control.kind === 'enum') patch[control.configKey] = String(value);
    else if (control.allowsUnset && !optionalOn[control.configKey]) patch[control.configKey] = -1;
    else patch[control.configKey] = Number(value);
  }
  return patch;
}

// The PUT /api/effects/<id>/params edits for a custom effect: every control, an optional
// one switched off as null (the graph's spelling of unset).
export function buildEffectEdits(controls, values, optionalOn) {
  return controls.filter((c) => c.writable).map((control) => {
    const key = controlKey(control);
    let value;
    if (control.kind === 'enum') value = String(values[key]);
    else if (control.allowsUnset && !optionalOn[key]) value = null;
    else value = Number(values[key]);
    return { node: control.node, param: control.param, value };
  });
}

export class TuningFields {
  // values: the full /api/config response -- the caller (DashboardScreen)
  // already fetches this for its own mode toggle. The graph and node schema
  // are fetched here (fetchGraph is injectable for tests).
  constructor(container, { values, monitors = [], selectedMonitorName = AUTO_MONITOR_VALUE, onUnreachable = null, onReloadError = null, fetchGraph = fetchTuningGraph }) {
    this.container = container;
    this.values = { ...values };
    this.monitors = monitors;
    this.selectedMonitorName = selectedMonitorName;
    this.onUnreachable = onUnreachable;
    this.onReloadError = onReloadError;
    this.error = null;
    this.dropdowns = [];
    // undefined while loading, null when no graph is available.
    this.controls = undefined;
    this.showsRefreshRate = false;
    this.optionalOn = {};
    this._render();
    fetchGraph().then((loaded) => {
      if (this._destroyed) return;
      this._adopt(loaded);
      this._render();
    });
  }

  destroy() {
    this._destroyed = true;
    for (const dropdown of this.dropdowns) dropdown.destroy();
    this.dropdowns = [];
  }

  _adopt(loaded) {
    if (!loaded) {
      this.controls = null;
      return;
    }
    this.effectId = loaded.effectId ?? null;
    this.controls = resolveControls(loaded.graph, loaded.nodeTypes, { effectId: this.effectId });
    // Video graphs follow the app refresh rate; audio graphs carry their own tickHz.
    this.showsRefreshRate = loaded.graph.tickHz === undefined;
    for (const control of this.controls) {
      const key = controlKey(control);
      if (this.values[key] === undefined && control.value !== null && control.value !== undefined) {
        this.values[key] = control.value;
      }
      if (control.allowsUnset) this.optionalOn[key] = Number(this.values[key] ?? -1) >= 0;
    }
    this._sentEdits = JSON.stringify(buildEffectEdits(this.controls, this.values, this.optionalOn));
  }

  _render() {
    for (const dropdown of this.dropdowns) dropdown.destroy();
    this.dropdowns = [];

    const message = this.error ?? (this.controls === null ? 'Tuning controls appear once the pipeline is running.' : null);
    const errorHtml = message
      ? `<p class="status-text${this.error ? ' status-text-error' : ''}">${this.error ? '<span class="warn-glyph" aria-hidden="true"></span> ' : ''}${escapeHtml(message)}</p>`
      : '';

    this.container.innerHTML = `
      <div class="tn-fields"></div>
      ${errorHtml}
    `;
    if (!this.controls) return;

    const fields = this.container.querySelector('.tn-fields');
    const groups = groupBySection(this.controls);
    if (groups.length === 0 && this.showsRefreshRate) groups.push({ section: '', controls: [] });
    groups.forEach((group, index) => this._renderGroup(fields, group, index));
  }

  _renderGroup(container, group, index) {
    const section = document.createElement('div');
    section.innerHTML = `
      ${group.section ? `<h2 class="section-heading">${escapeHtml(group.section)}</h2>` : ''}
      <div class="tuning-grid"></div>
    `;
    const grid = section.querySelector('.tuning-grid');
    container.append(...section.children);

    const withRefresh = index === 0 && this.showsRefreshRate;
    // A slider sharing a row with a taller dropdown gets a centered control band.
    const hasDropdown = withRefresh || group.controls.some(isDropdown);
    if (withRefresh) this._renderRefreshRate(grid);
    for (const control of group.controls) {
      if (isDropdown(control)) this._renderDropdown(grid, control);
      else this._renderSlider(grid, control, hasDropdown);
    }
  }

  _renderRefreshRate(grid) {
    // Presets, not free entry -- see REFRESH_RATE_PRESETS/_closestRefreshRate
    // above for why an unmatched detected value snaps to the nearest preset
    // for *display* only; nothing is persisted until the dropdown is
    // actually committed.
    const slot = this._dropdownSlot(grid, 'tn-refresh', 'Refresh rate');
    const current = Number(this.values.refreshRate) || REFRESH_RATE_PRESETS[0];
    const value = REFRESH_RATE_PRESETS.includes(current) ? current : _closestRefreshRate(current);
    const dropdown = new Dropdown(
      slot,
      String(value),
      (picked) => { this.values.refreshRate = Number(picked); this._autoSave(); },
      { labelId: 'tn-refresh-label', fill: true, tooltipKey: 'video.refreshRate' },
    );
    dropdown.setOptions(REFRESH_RATE_PRESETS.map((hz) => (
      { label: `${hz} Hz`, value: String(hz), selected: hz === value }
    )));
    this.dropdowns.push(dropdown);
  }

  _renderDropdown(grid, control) {
    const key = controlKey(control);
    const slot = this._dropdownSlot(grid, `tn-${control.id}`, control.label);
    let options;
    let current;
    let parse = String;
    if (control.configKey === 'subsampleWidth') {
      // Candidates depend on the selected monitor's real resolution; "Auto" (0)
      // leads the list, matching the backend's sentinel for "pick one at init".
      const monitor = _resolveMonitor(this.monitors, this.selectedMonitorName);
      const candidates = monitor ? subsampleCandidates(monitor.width, monitor.height) : [];
      options = [
        { label: 'Auto', value: '0' },
        ...candidates.map((c) => ({ label: `${c.width}px`, value: String(c.width) })),
      ];
      const stored = Number(this.values[key]) || 0;
      current = String(options.some((o) => Number(o.value) === stored) ? stored : 0);
      parse = Number;
    } else {
      options = control.options.map((name) => ({ label: name, value: name }));
      current = options.some((o) => o.value === this.values[key]) ? this.values[key] : control.value;
    }
    const dropdown = new Dropdown(
      slot,
      current,
      (picked) => { this.values[key] = parse(picked); this._autoSave(); },
      { labelId: `tn-${control.id}-label`, fill: true, tooltipKey: control.configKey ? sliderTooltipKey(control.configKey) : null, tooltip: control.tooltip },
    );
    dropdown.setOptions(options.map((o) => ({ ...o, selected: o.value === current })));
    if (!control.writable) dropdown.trigger.disabled = true;
    this.dropdowns.push(dropdown);
  }

  _dropdownSlot(grid, id, label) {
    const field = document.createElement('div');
    field.className = 'field';
    field.innerHTML = `
      <label class="field-label" id="${id}-label">${escapeHtml(label)}</label>
      <div id="${id}-dropdown-slot"></div>
    `;
    grid.append(field);
    return field.querySelector(`#${id}-dropdown-slot`);
  }

  _renderSlider(grid, control, controlBand) {
    const key = controlKey(control);
    const sliders = slidersFromControls([control]);
    const holder = document.createElement('div');
    holder.style.display = 'contents';

    if (control.allowsUnset) {
      holder.innerHTML = `
        <div class="tuning-checkbox-row">
          <label class="toggle-row">
            <span class="toggle-row-label">Use ${escapeHtml(control.label.toLowerCase())}</span>
            <span class="toggle-switch">
              <input type="checkbox" ${this.optionalOn[key] ? 'checked' : ''} />
              <span class="toggle-knob"></span>
            </span>
          </label>
        </div>
        ${this.optionalOn[key] ? sliderGroupHtml(sliders, this.values) : ''}
      `;
      grid.append(holder);
      const toggle = holder.querySelector('input[type="checkbox"]');
      applyTooltip(holder.querySelector('label.toggle-row'), control.toggleTooltipKey, control.tooltip);
      toggle.disabled = !control.writable;
      toggle.addEventListener('change', () => {
        this.optionalOn[key] = toggle.checked;
        if (toggle.checked && !(Number(this.values[key]) >= 0)) this.values[key] = control.min;
        this._render();
        this._autoSave();
      });
      if (!this.optionalOn[key]) return;
    } else {
      holder.innerHTML = sliderGroupHtml(sliders, this.values, { controlBand });
      grid.append(holder);
    }

    if (control.tooltip) holder.querySelector('.field')?.setAttribute('title', control.tooltip);
    wireSliderGroup(holder, sliders, this.values, control.writable ? () => this._autoSave() : null);
    if (!control.writable) holder.querySelector(`#tn-${key}`).disabled = true;
  }

  // Every field auto-saves on its own commit -- there's no manual Save button.
  // Coalesces overlapping calls the same way ZonePatchQueue does for zone
  // edits: at most one save in flight, always eventually sending whatever the
  // values were at the *last* commit, never a queued backlog of intermediate ones.
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
    const patch = buildPatch(this.controls ?? [], this.values, this.optionalOn, { includeRefreshRate: this.showsRefreshRate });
    const edits = isCustomEffect(this.effectId) ? buildEffectEdits(this.controls ?? [], this.values, this.optionalOn) : [];

    try {
      const results = [];
      if (Object.keys(patch).length > 0) {
        results.push(await (await fetch('/api/config', { method: 'PUT', body: JSON.stringify(patch) })).json());
      }
      // Skip a re-send of unchanged params (a refresh-rate change must not swap the graph).
      const sent = JSON.stringify(edits);
      if (edits.length > 0 && sent !== this._sentEdits) {
        const body = await (await fetch(`/api/effects/${encodeURIComponent(this.effectId)}/params`, {
          method: 'PUT',
          body: JSON.stringify({ params: edits }),
        })).json();
        if (body.succeeded) this._sentEdits = sent;
        results.push(body);
      }

      if (results.some((result) => !result.succeeded)) {
        this.error = "Couldn't save settings.";
      } else if (results.some((result) => result.reloadError)) {
        // Saved, not applied: the daemon holds the error and the shell
        // banner shows it (Aurora-98pr). Poke the beat for an early redraw.
        this.onReloadError?.();
      }
    } catch {
      // Unreachable owns this (shell takeover, Aurora-ewyz): poke the beat
      // when wired, no inline error.
      if (this.onUnreachable) this.onUnreachable();
      else this.error = DAEMON_UNREACHABLE;
    }

    this._render();
  }
}

function isDropdown(control) {
  return control.kind === 'enum' || control.configKey === 'subsampleWidth';
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
