// Mode + Device Select: audio/video toggle (shown only when both are
// compiled in), then the concrete device within that mode. See
// Analysis/WebUI/WebUI_Design_1stPass.md's Mode+Device Select section and build-order
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
// since no video input exists yet to enumerate. Mode/device changes apply
// live as soon as they're made (see _applyMode()), so switching to Video
// here refetches monitors right after -- this screen offers a single
// "Auto (primary)" choice only for the brief window before that resolves.
//
// Audio has no sink-listing endpoint yet (a documented backend gap, see
// step 11's writeup in WebUI/WebUI_Design_1stPass.md). Rather than a fake dropdown, this
// offers a plain optional text field for `audioTargetSinkName`, shown only
// when "linux-audio" is the registered audio input -- Windows audio always
// uses the default device and has no such field at all.
import { renderTopBar } from '../topBar.js';
import { renderNavFooter } from '../NavFooter.js';
import { DeviceField, AUTO_MONITOR_VALUE } from '../DeviceField.js';

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
    this.error = null;
    this.deviceField = null;
    this.applyPromise = null; // latest _applyMode run, if any -- Continue awaits it (see _onContinue)
  }

  async mount(container) {
    this.container = container;
    container.innerHTML = `
      <div class="top-bar-slot"></div>
      <div class="md-body"></div>
      <div class="nav-footer-slot"></div>
    `;
    renderTopBar(container.querySelector('.top-bar-slot'), {
      title: 'Capture source',
      showBack: false,
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

    // Connects the default/current mode immediately on landing, rather than
    // waiting for Continue -- this screen used to defer everything to that
    // click, so nothing ever actually reacted until the *next* screen loaded
    // (see WebUI_Fixes.md Pass 2). Skipped if a valid mode is already
    // applied (e.g. navigating back here) to avoid an unnecessary reconnect.
    const modeAlreadyValid = this.mode === 'video'
      ? this.inputs.includes(this.currentActiveInputName)
      : this.audioInputs.includes(this.currentActiveAudioInputName);
    if (!modeAlreadyValid) {
      await this._applyMode();
    }
  }

  unmount() {
    this.deviceField?.destroy();
    this.deviceField = null;
  }

  _render() {
    const body = this.container.querySelector('.md-body');
    const footer = this.container.querySelector('.nav-footer-slot');
    this.deviceField?.destroy();
    this.deviceField = null;

    const toggleHtml = this.hasAudio ? `
      <div class="segmented" role="group" aria-label="Capture mode">
        <button type="button" class="segmented-btn${this.mode === 'video' ? ' active' : ''}" id="md-mode-video">Video</button>
        <button type="button" class="segmented-btn${this.mode === 'audio' ? ' active' : ''}" id="md-mode-audio">Audio</button>
      </div>
    ` : '';

    // Zone Mapping is skipped entirely for Audio mode (probeState() in
    // app.js only requires it for 'video') -- this just explains why, since
    // otherwise a NUX user would wonder why they never see that step.
    const audioNoteHtml = this.mode === 'audio'
      ? `<p class="status-text">Zones react together in Audio mode — there's no per-zone mapping step.</p>`
      : '';

    const errorHtml = this.error ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.error)}</p>` : '';

    body.innerHTML = `
      ${toggleHtml}
      ${audioNoteHtml}
      <div class="md-device"></div>
      ${errorHtml}
    `;

    if (this.hasAudio) {
      body.querySelector('#md-mode-video').addEventListener('click', () => this._switchMode('video'));
      body.querySelector('#md-mode-audio').addEventListener('click', () => this._switchMode('audio'));
    }

    const deviceSlot = body.querySelector('.md-device');
    this.deviceField = new DeviceField(deviceSlot, {
      mode: this.mode,
      monitors: this.monitors,
      selectedMonitorName: this.selectedMonitorName,
      showSinkField: this.showSinkField,
      sinkName: this.sinkName,
      onChange: (patch) => this._onDeviceFieldChange(patch),
    });

    renderNavFooter(footer, {
      showBack: this.showBack,
      onBack: () => this.onBack(),
      onContinue: () => this._onContinue(),
    });
  }

  // Continue's target is decided by a fresh probeState() read, which must
  // observe this screen's own last save -- navigating while our PUT/reload
  // is still in flight lets the probe read the pre-switch pipeline (e.g.
  // the old audio pipeline's empty zones) and wrongly skip Zone Mapping
  // straight to the Dashboard on a fresh NUX. A rejected apply must not
  // trap the user here: _applyMode already surfaces failures inline via
  // this.error, so navigate regardless and let the probe decide.
  async _onContinue() {
    try {
      await this.applyPromise;
    } catch {
      // See above -- fall through to navigation.
    }
    this.onComplete();
  }

  async _switchMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this._render();
    await this._applyMode();
  }

  // Device field edits (monitor pick, sink name) apply live immediately,
  // same convention DashboardScreen's own copy of this component uses.
  async _onDeviceFieldChange(patch) {
    Object.assign(this, patch);
    await this._applyMode();
  }

  // Applies the currently selected mode/device live -- called on landing
  // (if nothing valid is configured yet), on every mode click, and on every
  // device field edit. Continue is now pure navigation, not a save action;
  // WebUI_Fixes.md Pass 2 has the "nothing reacted until the next screen"
  // report this replaces. Tracked so _onContinue can wait for it.
  async _applyMode() {
    this.applyPromise = this._doApplyMode();
    await this.applyPromise;
  }

  async _doApplyMode() {
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
      } else if (result.reloadError) {
        this.error = `Saved, but couldn't apply it live: ${result.reloadError}`;
      } else if (this.mode === 'video') {
        this.currentActiveInputName = patch.activeInputName;
        // Now resolvable within this same screen visit, since the mode just
        // applied live instead of waiting for Continue -- refetch so a real
        // monitor list can replace the "Auto (primary)" placeholder.
        try {
          const monitorsResult = await (await fetch('/api/monitors')).json();
          this.monitors = monitorsResult.monitors ?? [];
        } catch {
          this.monitors = [];
        }
      } else {
        this.currentActiveAudioInputName = patch.activeAudioInputName;
      }
    } catch {
      this.error = "Couldn't reach the daemon.";
    }

    this._render();
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
