// Monitor dropdown (video) / optional sink text field (audio), swapped by
// mode -- pulled out of ModeDeviceScreen.js so DashboardScreen's top tier
// (docs/WebUI/WebUI_Design_2ndPass.md) can compose the same field without
// duplicating _renderVideoDevice/_renderAudioDevice. Same "destroy and
// recreate on every re-render" convention as Dropdown itself -- no update()
// method; callers rebuild a new instance when mode/props change.
import { Dropdown } from './Dropdown.js';
import { applyTooltip } from './Tooltips.js';

export const AUTO_MONITOR_VALUE = '';

export class DeviceField {
  // onChange receives { selectedMonitorName } in video mode or
  // { sinkName } in audio mode, whichever this field can actually change.
  // audioSinkStatus is { followingDefault, sinkName } from
  // GET /api/linux/audio-status, or null when unknown (fetch failed, old
  // daemon, not capturing) -- null keeps the legacy no-list hint.
  constructor(container, { mode, monitors = [], selectedMonitorName = AUTO_MONITOR_VALUE, showSinkField = false, sinkName = '', audioSinkStatus = null, onChange }) {
    this.container = container;
    this.onChange = onChange;
    this.dropdown = null;

    if (mode === 'video') this._renderVideo(monitors, selectedMonitorName);
    else this._renderAudio(showSinkField, sinkName, audioSinkStatus);
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

  _renderAudio(showSinkField, sinkName, audioSinkStatus) {
    if (!showSinkField) {
      this.container.innerHTML = `<p class="status-text">Uses your system's default audio device.</p>`;
      return;
    }

    // The resolved name is hint text only, never written into the input --
    // writing it would persist into audioTargetSinkName on save and pin the
    // sink, breaking follow-the-default (Aurora-4vf, via Aurora-u1u).
    let hintHtml = `<p class="status-text">No device list is available yet — enter a PipeWire sink name exactly, or leave blank for the default.</p>`;
    if (audioSinkStatus && audioSinkStatus.sinkName) {
      const name = escapeHtml(audioSinkStatus.sinkName);
      hintHtml = audioSinkStatus.followingDefault
        ? `<p class="status-text">Using: ${name} (system default). Type a sink name above to use a different device.</p>`
        : `<p class="status-text">Using sink: ${name}. Clear the field to follow the system default.</p>`;
    }

    this.container.innerHTML = `
      <div class="field">
        <label class="field-label" for="device-field-sink-input">Audio device (optional)</label>
        <input id="device-field-sink-input" class="text-input" type="text" placeholder="System default" />
      </div>
      ${hintHtml}
    `;
    const input = this.container.querySelector('#device-field-sink-input');
    input.value = sinkName;
    applyTooltip(input, 'input.sink');
    input.addEventListener('input', () => this.onChange?.({ sinkName: input.value }));
  }

  // Call before discarding an instance (e.g. before a full-container
  // innerHTML rebuild) so its internal Dropdown doesn't linger.
  destroy() {
    this.dropdown?.destroy();
    this.dropdown = null;
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
