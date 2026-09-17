// Monitor dropdown (video) / optional sink text field (audio), swapped by
// mode -- pulled out of ModeDeviceScreen.js so DashboardScreen's top tier
// (Analysis/WebUI/WebUI_Design_2ndPass.md) can compose the same field without
// duplicating _renderVideoDevice/_renderAudioDevice. Same "destroy and
// recreate on every re-render" convention as Dropdown itself -- no update()
// method; callers rebuild a new instance when mode/props change.
import { Dropdown } from './Dropdown.js';

export const AUTO_MONITOR_VALUE = '';

export class DeviceField {
  // onChange receives { selectedMonitorName } in video mode or
  // { sinkName } in audio mode, whichever this field can actually change.
  constructor(container, { mode, monitors = [], selectedMonitorName = AUTO_MONITOR_VALUE, showSinkField = false, sinkName = '', onChange }) {
    this.container = container;
    this.onChange = onChange;
    this.dropdown = null;

    if (mode === 'video') this._renderVideo(monitors, selectedMonitorName);
    else this._renderAudio(showSinkField, sinkName);
  }

  _renderVideo(monitors, selectedMonitorName) {
    if (monitors.length === 0) {
      this.container.innerHTML = `
        <p class="status-text">Auto (primary display) — a specific monitor can be chosen here once Video mode is running. Save, then reopen this screen to pick one.</p>
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
      { labelId: 'device-field-monitor-label', fill: true },
    );
    this.dropdown.setOptions(options);
  }

  _renderAudio(showSinkField, sinkName) {
    if (!showSinkField) {
      this.container.innerHTML = `<p class="status-text">Uses your system's default audio device.</p>`;
      return;
    }

    this.container.innerHTML = `
      <div class="field">
        <label class="field-label" for="device-field-sink-input">Audio device (optional)</label>
        <input id="device-field-sink-input" class="text-input" type="text" placeholder="System default" />
      </div>
      <p class="status-text">No device list is available yet — enter a PipeWire sink name exactly, or leave blank for the default.</p>
    `;
    const input = this.container.querySelector('#device-field-sink-input');
    input.value = sinkName;
    input.addEventListener('input', () => this.onChange?.({ sinkName: input.value }));
  }

  // Call before discarding an instance (e.g. before a full-container
  // innerHTML rebuild) so its internal Dropdown doesn't linger.
  destroy() {
    this.dropdown?.destroy();
    this.dropdown = null;
  }
}
