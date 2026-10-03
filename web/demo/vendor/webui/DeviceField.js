// Monitor dropdown (usesVideoInput) and/or audio device dropdown
// (usesAudioInput) -- shared by ModeDeviceScreen and DashboardScreen's top
// tier (docs/WebUI/WebUI_Design_2ndPass.md). Flags, not a mode (Aurora-kea):
// both true shows both, monitor first. Same "destroy and recreate on every
// re-render" convention as Dropdown itself -- no update() method; callers
// rebuild a new instance when props change.
//
// The audio device list comes from audioDevicesUrl (GET /api/state; Linux's
// /api/linux/audio-sinks, Aurora-67y). With no URL the field just says it
// uses the system default. The list loads when the field is built and
// refreshes on every dropdown open; the
// menu only re-renders when the option rows actually differ, so
// steady-state opens show no flicker or cursor jump. Never on
// DashboardScreen's 5s audio-status poll (Aurora-apn).
import { Dropdown } from './Dropdown.js';
import { applyTooltip } from './Tooltips.js';

export const AUTO_MONITOR_VALUE = '';
export const SYSTEM_DEFAULT_SINK_VALUE = '';

// Default sink loader: [{name, description}] from the daemon, or a
// rejection the caller turns into its System-default-only fallback.
// Injectable via the constructor for tests.
async function loadAudioSinksFrom(url) {
  const result = await (await fetch(url)).json();
  if (!result || !Array.isArray(result.sinks)) throw new Error('bad audio-sinks shape');
  return result.sinks.filter((s) => s && typeof s.name === 'string');
}

export function sinkOptionLabel(sink) {
  // Description only (the node name stays the option value) -- the
  // "Description — node.name" pair read as clutter in the menu.
  return sink.description || sink.name;
}

// Shallow row comparison for the open-refresh diff gate: label, value,
// and selected all feed the rendered menu, so all three must match to
// skip the setOptions rebuild.
export function sinkOptionsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((o, i) => o.label === b[i].label && o.value === b[i].value && o.selected === b[i].selected);
}

export class DeviceField {
  // onChange receives { selectedMonitorName } from the monitor dropdown or
  // { sinkName } from the audio device dropdown.
  constructor(container, {
    usesVideoInput = true, usesAudioInput = false, audioDevicesUrl = null,
    monitors = [], selectedMonitorName = AUTO_MONITOR_VALUE, sinkName = '',
    loadAudioSinks, onChange,
  }) {
    this.container = container;
    this.onChange = onChange;
    this.monitorDropdown = null;
    this.dropdown = null; // the audio device dropdown
    this._destroyed = false;

    // Never empty: no flags at all still shows the monitor picker.
    const showVideo = usesVideoInput || !usesAudioInput;
    const showSinkDropdown = usesAudioInput && !!audioDevicesUrl;

    // One container, no per-part wrappers, so a single picker's DOM is
    // unchanged from the mode-swapped field this replaced.
    container.innerHTML = (showVideo ? this._videoHtml(monitors) : '')
      + (usesAudioInput ? this._audioHtml(showSinkDropdown) : '');

    if (showVideo && monitors.length > 0) this._wireVideo(monitors, selectedMonitorName);
    if (showSinkDropdown) {
      this._wireAudio(sinkName, loadAudioSinks ?? (() => loadAudioSinksFrom(audioDevicesUrl)));
    }
  }

  _videoHtml(monitors) {
    if (monitors.length === 0) {
      return `
        <p class="status-text">Auto (primary display) — a specific monitor can be chosen here once Video mode finishes connecting.</p>
      `;
    }
    return `
      <div class="field">
        <label class="field-label" id="device-field-monitor-label">Monitor</label>
        <div id="device-field-monitor-dropdown-slot"></div>
      </div>
    `;
  }

  _audioHtml(showSinkDropdown) {
    if (!showSinkDropdown) {
      return `<p class="status-text">Uses your system's default audio device.</p>`;
    }
    return `
      <div class="field">
        <label class="field-label" id="device-field-sink-label">Audio device</label>
        <div id="device-field-sink-dropdown-slot"></div>
      </div>
    `;
  }

  _wireVideo(monitors, selectedMonitorName) {
    const options = [
      { label: 'Auto (primary)', value: AUTO_MONITOR_VALUE, selected: selectedMonitorName === AUTO_MONITOR_VALUE },
      ...monitors.map((m) => ({
        label: `${m.name} — ${m.width}x${m.height}${m.isPrimary ? ' (primary)' : ''}`,
        value: m.name,
        selected: m.name === selectedMonitorName,
      })),
    ];
    const selected = options.find((o) => o.selected) ?? options[0];

    const slot = this.container.querySelector('#device-field-monitor-dropdown-slot');
    this.monitorDropdown = new Dropdown(
      slot,
      selected.label,
      (value) => this.onChange?.({ selectedMonitorName: value }),
      { labelId: 'device-field-monitor-label', fill: true, tooltipKey: 'input.monitor' },
    );
    this.monitorDropdown.setOptions(options);
  }

  _wireAudio(sinkName, loadAudioSinks) {
    this._sinkName = sinkName;
    this._loadAudioSinks = loadAudioSinks;
    this._sinks = null; // null until the first load lands
    this._sinksLoading = false;
    this._appliedOptions = []; // last rows handed to setOptions (diff gate)

    const options = this._sinkOptions();
    const selected = options.find((o) => o.selected) ?? options[0];

    const slot = this.container.querySelector('#device-field-sink-dropdown-slot');
    this.dropdown = new Dropdown(
      slot,
      selected.label,
      (value) => {
        // Stash before notifying: a later refresh rebuilds options from
        // this, and must keep the new pick selected, not the ctor prop.
        this._sinkName = value;
        // Keep the diff-gate snapshot in sync (Dropdown._commit mutates
        // its own option objects, not this copy).
        this._appliedOptions = this._appliedOptions.map((o) => ({ ...o, selected: o.value === value }));
        this.onChange?.({ sinkName: value });
      },
      { labelId: 'device-field-sink-label', fill: true, tooltipKey: 'input.sink' },
    );
    this.dropdown.setOptions(options);
    this._appliedOptions = options.map((o) => ({ ...o }));

    // Refresh on every open: hotplugged sinks appear on the next open.
    // Every open path (trigger click, Enter / Space / arrows,
    // programmatic toggle) funnels through openMenu, so one wrap covers
    // them all with no per-path listeners.
    const baseOpen = this.dropdown.openMenu.bind(this.dropdown);
    this.dropdown.openMenu = () => {
      baseOpen();
      this._reloadSinks();
    };

    // Populate when built; the openMenu wrap above refreshes
    // on every open. Fire-and-forget: the _destroyed guard drops the
    // trailing redraw if the field is rebuilt before it lands.
    this._reloadSinks();
  }

  _sinkOptions() {
    const options = [
      { label: 'System default', value: SYSTEM_DEFAULT_SINK_VALUE, selected: this._sinkName === SYSTEM_DEFAULT_SINK_VALUE },
    ];
    const seen = new Set([SYSTEM_DEFAULT_SINK_VALUE]);
    for (const sink of this._sinks ?? []) {
      if (seen.has(sink.name)) continue;
      seen.add(sink.name);
      options.push({ label: sinkOptionLabel(sink), value: sink.name, selected: sink.name === this._sinkName });
    }
    // A persisted name the list doesn't (or doesn't yet) contain --
    // unplugged device, failed first load -- still renders selected, so
    // the trigger never displays a value that isn't what's persisted.
    if (this._sinkName !== SYSTEM_DEFAULT_SINK_VALUE && !seen.has(this._sinkName)) {
      options.push({ label: this._sinkName, value: this._sinkName, selected: true });
    }
    return options;
  }

  async _reloadSinks() {
    if (this._sinksLoading) return;
    this._sinksLoading = true;
    try {
      const sinks = await this._loadAudioSinks();
      if (this._destroyed) return;
      this._sinks = sinks;
    } catch {
      if (this._destroyed) return;
      // A refresh failure keeps the previously loaded options (a
      // first-load failure keeps System-default-only + persisted); the
      // next open retries silently.
    } finally {
      this._sinksLoading = false;
    }
    // Diff gate: identical rows skip the rebuild, so steady-state opens
    // show no flicker or keyboard-cursor jump.
    const next = this._sinkOptions();
    if (!sinkOptionsEqual(this._appliedOptions, next)) {
      this._appliedOptions = next.map((o) => ({ ...o }));
      this.dropdown.setOptions(next);
      // setOptions rebuilds the menu rows but leaves the trigger label
      // alone -- without this it keeps showing the raw persisted node
      // name it was constructed with before the list landed.
      const sel = next.find((o) => o.selected) ?? next[0];
      this.dropdown.setTriggerLabel(sel.label);
    }
  }

  // Call before discarding an instance (e.g. before a full-container
  // innerHTML rebuild) so its internal Dropdown doesn't linger. Also
  // disarms an in-flight sink load's trailing redraw.
  destroy() {
    this._destroyed = true;
    this.monitorDropdown?.destroy();
    this.monitorDropdown = null;
    this.dropdown?.destroy();
    this.dropdown = null;
  }
}
