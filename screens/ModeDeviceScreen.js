// Mode + Device Select: audio/video toggle (shown only when both are
// compiled in), then the concrete device within that mode. See
// Analysis/WebUIAnalysis.md's Mode+Device Select section and build-order
// step 12.
//
// Same onComplete-callback DI shape as OutputConnectScreen: the caller
// decides where "done" goes (Dashboard today; a future first-run bootstrap
// could chain into Zone Mapping instead without this file changing).
//
// Video input name and audio input name are never shown as raw choices --
// `activeInputName`/`activeAudioInputName` are plugin-registry names like
// "windows"/"linux"/"x11"/"pipewire"/"windows-audio", an implementation
// detail this screen resolves on the user's behalf (see pickVideoInputName/
// pickAudioInputName below) rather than exposing as a second dropdown.
//
// GET /api/monitors reflects only whatever the *live* pipeline actually
// constructed (PipelineHost::listMonitors in each app's main.cpp) -- it
// comes back empty whenever the daemon is currently running in audio mode,
// since no video input exists yet to enumerate. Switching to Video here
// can't show real monitor choices until after Done reloads the daemon into
// video mode once; this screen offers a single "Auto (primary)" choice in
// that case and says so, rather than pretending it has a real list.
//
// Audio has no sink-listing endpoint yet (a documented backend gap, see
// step 11's writeup in WebUIAnalysis.md). Rather than a fake dropdown, this
// offers a plain optional text field for `audioTargetSinkName`, shown only
// when "linux-audio" is the registered audio input -- Windows audio always
// uses the default device and has no such field at all.
import { renderTopBar } from '../topBar.js';
import { Dropdown } from '../Dropdown.js';

const AUTO_MONITOR_VALUE = '';

export function pickVideoInputName(inputs, current) {
  if (current && current !== 'dummy' && inputs.includes(current)) return current;
  for (const preferred of ['linux', 'windows']) {
    if (inputs.includes(preferred)) return preferred;
  }
  const real = inputs.filter((n) => n !== 'dummy');
  return real[0] ?? inputs[0] ?? '';
}

export function pickAudioInputName(audioInputs, current) {
  if (current && audioInputs.includes(current)) return current;
  return audioInputs[0] ?? '';
}

export class ModeDeviceScreen {
  constructor(app, { onComplete, onBack, showBack = true }) {
    this.app = app;
    this.onComplete = onComplete;
    this.onBack = onBack ?? onComplete;
    this.showBack = showBack;
    this.mode = 'video';
    this.hasAudio = false;
    this.inputs = [];
    this.audioInputs = [];
    this.currentActiveInputName = '';
    this.currentActiveAudioInputName = '';
    this.monitors = [];
    this.selectedMonitorName = AUTO_MONITOR_VALUE;
    this.sinkName = '';
    this.showSinkField = false;
    this.phase = 'edit'; // 'edit' | 'done'
    this.error = null;
    this.dropdown = null;
  }

  async mount(container) {
    this.container = container;
    container.innerHTML = `
      <div class="top-bar-slot"></div>
      <div class="md-body"></div>
    `;
    renderTopBar(container.querySelector('.top-bar-slot'), {
      title: 'Capture source',
      showBack: this.showBack,
      onBack: () => this.onBack(),
      onSettings: () => this.app.openSettings(),
    });

    const body = container.querySelector('.md-body');
    body.innerHTML = `<p class="status-text">Loading…</p>`;

    let capabilities;
    let config;
    try {
      [capabilities, config] = await Promise.all([
        fetch('/api/capabilities').then((r) => r.json()),
        fetch('/api/config').then((r) => r.json()),
      ]);
    } catch {
      body.innerHTML = `<p class="status-text status-text-error">⚠ Could not reach the daemon.</p>`;
      return;
    }

    this.inputs = capabilities.inputs ?? [];
    this.audioInputs = capabilities.audioInputs ?? [];
    this.hasAudio = this.audioInputs.length > 0;
    this.showSinkField = this.audioInputs.includes('linux-audio');

    this.currentActiveInputName = config.activeInputName ?? '';
    this.currentActiveAudioInputName = config.activeAudioInputName ?? '';
    this.mode = (!this.currentActiveInputName && this.currentActiveAudioInputName) ? 'audio' : 'video';
    this.selectedMonitorName = config.activeMonitorName || AUTO_MONITOR_VALUE;
    this.sinkName = config.audioTargetSinkName || '';

    try {
      const monitorsResult = await (await fetch('/api/monitors')).json();
      this.monitors = monitorsResult.monitors ?? [];
    } catch {
      this.monitors = [];
    }

    this._render();
  }

  unmount() {
    this.dropdown?.destroy();
    this.dropdown = null;
  }

  _render() {
    const body = this.container.querySelector('.md-body');
    this.dropdown?.destroy();
    this.dropdown = null;

    if (this.phase === 'done') {
      body.innerHTML = `
        <p class="status-text status-text-success">✓ Saved.</p>
        <div class="md-actions">
          <button type="button" class="btn btn-primary" id="md-continue">Continue</button>
        </div>
      `;
      body.querySelector('#md-continue').addEventListener('click', () => this.onComplete());
      return;
    }

    const toggleHtml = this.hasAudio ? `
      <div class="segmented" role="group" aria-label="Capture mode">
        <button type="button" class="segmented-btn${this.mode === 'video' ? ' active' : ''}" id="md-mode-video">Video</button>
        <button type="button" class="segmented-btn${this.mode === 'audio' ? ' active' : ''}" id="md-mode-audio">Audio</button>
      </div>
    ` : '';

    const errorHtml = this.error ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.error)}</p>` : '';

    body.innerHTML = `
      ${toggleHtml}
      <div class="md-device"></div>
      ${errorHtml}
      <div class="md-actions">
        <button type="button" class="btn btn-primary" id="md-done">Done</button>
      </div>
    `;

    if (this.hasAudio) {
      body.querySelector('#md-mode-video').addEventListener('click', () => { this.mode = 'video'; this._render(); });
      body.querySelector('#md-mode-audio').addEventListener('click', () => { this.mode = 'audio'; this._render(); });
    }

    const deviceSlot = body.querySelector('.md-device');
    if (this.mode === 'video') this._renderVideoDevice(deviceSlot);
    else this._renderAudioDevice(deviceSlot);

    body.querySelector('#md-done').addEventListener('click', (e) => this._save(e.currentTarget));
  }

  _renderVideoDevice(slot) {
    if (this.monitors.length === 0) {
      slot.innerHTML = `
        <p class="status-text">Auto (primary display) — a specific monitor can be chosen here once Video mode is running. Save, then reopen this screen to pick one.</p>
      `;
      return;
    }

    slot.innerHTML = `
      <div class="field">
        <label class="field-label" id="md-monitor-label">Monitor</label>
        <div id="md-monitor-dropdown-slot"></div>
      </div>
    `;

    const options = [
      { label: 'Auto (primary)', value: AUTO_MONITOR_VALUE, selected: this.selectedMonitorName === AUTO_MONITOR_VALUE },
      ...this.monitors.map((m) => ({
        label: `${m.name} — ${m.width}x${m.height}${m.isPrimary ? ' (primary)' : ''}`,
        value: m.name,
        selected: m.name === this.selectedMonitorName,
      })),
    ];
    const selected = options.find((o) => o.selected) ?? options[0];

    const slotEl = slot.querySelector('#md-monitor-dropdown-slot');
    this.dropdown = new Dropdown(
      slotEl,
      selected.label,
      (value) => { this.selectedMonitorName = value; },
      { labelId: 'md-monitor-label', fill: true },
    );
    this.dropdown.setOptions(options);
  }

  _renderAudioDevice(slot) {
    if (!this.showSinkField) {
      slot.innerHTML = `<p class="status-text">Uses your system's default audio device.</p>`;
      return;
    }

    slot.innerHTML = `
      <div class="field">
        <label class="field-label" for="md-sink-input">Audio device (optional)</label>
        <input id="md-sink-input" class="text-input" type="text" placeholder="System default" />
      </div>
      <p class="status-text">No device list is available yet — enter a PipeWire sink name exactly, or leave blank for the default.</p>
    `;
    const input = slot.querySelector('#md-sink-input');
    input.value = this.sinkName;
    input.addEventListener('input', () => { this.sinkName = input.value; });
  }

  async _save(button) {
    button.disabled = true;
    this.error = null;

    const patch = this.mode === 'video'
      ? {
          activeInputName: pickVideoInputName(this.inputs, this.currentActiveInputName),
          ...(this.monitors.length > 0 ? { activeMonitorName: this.selectedMonitorName } : {}),
        }
      : {
          activeInputName: '',
          activeAudioInputName: pickAudioInputName(this.audioInputs, this.currentActiveAudioInputName),
          audioTargetSinkName: this.sinkName.trim(),
        };

    try {
      const result = await (await fetch('/api/config', {
        method: 'PUT',
        body: JSON.stringify(patch),
      })).json();

      if (!result.succeeded) {
        this.error = "Couldn't save capture settings.";
        button.disabled = false;
        this._render();
        return;
      }
      if (result.reloadError) {
        this.error = `Saved, but couldn't apply it live: ${result.reloadError}`;
        button.disabled = false;
        this._render();
        return;
      }

      this.phase = 'done';
      this._render();
    } catch {
      this.error = "Couldn't reach the daemon.";
      button.disabled = false;
      this._render();
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
