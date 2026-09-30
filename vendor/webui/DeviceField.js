// Monitor dropdown (video) / sink dropdown (audio), swapped by mode --
// pulled out of ModeDeviceScreen.js so DashboardScreen's top tier
// (docs/WebUI/WebUI_Design_2ndPass.md) can compose the same field without
// duplicating _renderVideoDevice/_renderAudioDevice. Same "destroy and
// recreate on every re-render" convention as Dropdown itself -- no update()
// method; callers rebuild a new instance when mode/props change.
//
// The audio sink list (GET /api/linux/audio-sinks, Aurora-67y) loads
// lazily on first dropdown open plus an explicit Refresh -- never on
// render and never on DashboardScreen's 5s audio-status poll.
import { Dropdown } from './Dropdown.js';
import { applyTooltip } from './Tooltips.js';

export const AUTO_MONITOR_VALUE = '';
export const SYSTEM_DEFAULT_SINK_VALUE = '';

const AUDIO_SINKS_URL = '/api/linux/audio-sinks';

// Default sink loader: [{name, description}] from the daemon, or a
// rejection the caller turns into its System-default-only fallback.
// Injectable via the constructor for tests.
async function defaultLoadAudioSinks() {
  const result = await (await fetch(AUDIO_SINKS_URL)).json();
  if (!result || !Array.isArray(result.sinks)) throw new Error('bad audio-sinks shape');
  return result.sinks.filter((s) => s && typeof s.name === 'string');
}

export function sinkOptionLabel(sink) {
  if (sink.description && sink.description !== sink.name) return `${sink.description} — ${sink.name}`;
  return sink.name;
}

export class DeviceField {
  // onChange receives { selectedMonitorName } in video mode or
  // { sinkName } in audio mode, whichever this field can actually change.
  // audioSinkStatus is { followingDefault, sinkName } from
  // GET /api/linux/audio-status, or null when unknown (fetch failed, old
  // daemon, not capturing) -- null hides the Using-hint, not the dropdown.
  constructor(container, { mode, monitors = [], selectedMonitorName = AUTO_MONITOR_VALUE, showSinkField = false, sinkName = '', audioSinkStatus = null, loadAudioSinks = defaultLoadAudioSinks, onChange }) {
    this.container = container;
    this.onChange = onChange;
    this.dropdown = null;
    this._destroyed = false;

    if (mode === 'video') this._renderVideo(monitors, selectedMonitorName);
    else this._renderAudio(showSinkField, sinkName, audioSinkStatus, loadAudioSinks);
  }

  _renderVideo(monitors, selectedMonitorName) {
    if (monitors.length === 0) {
      this.container.innerHTML = `
        <p class="status-text">Auto (primary display) — a specific monitor can be chosen here once Video mode finishes connecting.</p>
      `;
      return;
    }

    this.container.innerHTML = `
      <div class="field">
        <label class="field-label" id="device-field-monitor-label">Monitor</label>
        <div id="device-field-monitor-dropdown-slot"></div>
      </div>
    `;

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
    this.dropdown = new Dropdown(
      slot,
      selected.label,
      (value) => this.onChange?.({ selectedMonitorName: value }),
      { labelId: 'device-field-monitor-label', fill: true, tooltipKey: 'input.monitor' },
    );
    this.dropdown.setOptions(options);
  }

  _renderAudio(showSinkField, sinkName, audioSinkStatus, loadAudioSinks) {
    if (!showSinkField) {
      this.container.innerHTML = `<p class="status-text">Uses your system's default audio device.</p>`;
      return;
    }

    this._sinkName = sinkName;
    this._audioSinkStatus = audioSinkStatus;
    this._loadAudioSinks = loadAudioSinks;
    this._sinks = null; // null until the first open/refresh loads them
    this._sinksLoading = false;
    this._sinksFailed = false;

    this.container.innerHTML = `
      <div class="field">
        <label class="field-label" id="device-field-sink-label">Audio device (optional)</label>
        <div id="device-field-sink-dropdown-slot"></div>
      </div>
      <button type="button" class="btn-link" id="device-field-sink-refresh">Refresh device list</button>
      <div id="device-field-sink-hint"></div>
    `;

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
        this.onChange?.({ sinkName: value });
      },
      { labelId: 'device-field-sink-label', fill: true, tooltipKey: 'input.sink' },
    );
    this.dropdown.setOptions(options);

    // Lazy load on first open: every open path (trigger click, Enter /
    // Space / arrows, programmatic toggle) funnels through openMenu, so
    // one wrap covers them all with no per-path listeners.
    const baseOpen = this.dropdown.openMenu.bind(this.dropdown);
    this.dropdown.openMenu = () => {
      baseOpen();
      this._ensureSinksLoaded();
    };

    this.container.querySelector('#device-field-sink-refresh').addEventListener('click', () => this._reloadSinks());
    this._renderSinkHint();
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

  async _ensureSinksLoaded() {
    if (this._sinks !== null || this._sinksLoading) return;
    await this._reloadSinks();
  }

  async _reloadSinks() {
    if (this._sinksLoading) return;
    this._sinksLoading = true;
    this._sinksFailed = false;
    this._renderSinkHint();
    try {
      const sinks = await this._loadAudioSinks();
      if (this._destroyed) return;
      this._sinks = sinks;
    } catch {
      if (this._destroyed) return;
      this._sinksFailed = true;
      // A refresh failure keeps the previously loaded options (a
      // first-load failure keeps System-default-only + persisted).
    } finally {
      this._sinksLoading = false;
    }
    this.dropdown.setOptions(this._sinkOptions());
    this._renderSinkHint();
  }

  _renderSinkHint() {
    const slot = this.container.querySelector('#device-field-sink-hint');
    if (!slot) return;

    // The resolved name is hint text only, never written into the input --
    // writing it would persist into audioTargetSinkName on save and pin the
    // sink, breaking follow-the-default (Aurora-4vf, via Aurora-u1u).
    let usingHtml = '';
    if (this._audioSinkStatus && this._audioSinkStatus.sinkName) {
      const name = escapeHtml(this._audioSinkStatus.sinkName);
      usingHtml = this._audioSinkStatus.followingDefault
        ? `<p class="status-text">Using: ${name} (system default). Pick a device above to use a different one.</p>`
        : `<p class="status-text">Using sink: ${name}. Pick System default above to follow the system default.</p>`;
    }

    let loadHtml = '';
    if (this._sinksLoading) {
      loadHtml = `<p class="status-text">Loading device list…</p>`;
    } else if (this._sinksFailed && this._sinks === null) {
      loadHtml = `<p class="status-text">Couldn't load the device list — System default still works.</p>`;
    } else if (this._sinks !== null && this._sinks.length === 0) {
      loadHtml = `<p class="status-text">No audio devices found — System default still works.</p>`;
    }
    slot.innerHTML = `${usingHtml}${loadHtml}`;
  }

  // Call before discarding an instance (e.g. before a full-container
  // innerHTML rebuild) so its internal Dropdown doesn't linger. Also
  // disarms an in-flight sink load's trailing redraw.
  destroy() {
    this._destroyed = true;
    this.dropdown?.destroy();
    this.dropdown = null;
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
