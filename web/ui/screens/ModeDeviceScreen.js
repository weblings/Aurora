// Mode + Device Select: audio/video toggle (shown only when both are
// compiled in), then the concrete device within that mode. See
// docs/WebUI/WebUI_Design_1stPass.md's Mode+Device Select section and build-order
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
// Audio's device list comes from GET /api/state's audioDevicesUrl (Linux:
// /api/linux/audio-sinks, Aurora-67y) -- DeviceField renders it as a
// dropdown with a System default entry. Builds with no URL (Mac, Windows)
// always use the default device and show no dropdown.
//
// Video/Audio logic is shared with DashboardScreen through CaptureSource.js
// (Aurora-kea). This screen is the chooser, so its sections follow the
// user's choice (flagsForMode) right away rather than waiting for it to run.
import { renderTopBar } from '../topBar.js';
import { renderNavFooter } from '../NavFooter.js';
import { DeviceField, AUTO_MONITOR_VALUE } from '../DeviceField.js';
import { applyTooltip } from '../Tooltips.js';
import { renderReloadError, parseMacPermissionError } from '../MacPermissionRecovery.js';
import {
  audioDevicesUrlFrom, flagsForMode, isModeConfigValid, loadPipelineState, modeFromConfig, modeSwitchPatch,
} from '../CaptureSource.js';

export { pickVideoInputName, pickAudioInputName } from '../CaptureSource.js';

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
    this.audioDevicesUrl = null;
    this.platform = '';
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
    let state;
    try {
      [capabilities, config, state] = await Promise.all([
        fetch('/api/capabilities').then((r) => r.json()),
        fetch('/api/config').then((r) => r.json()),
        loadPipelineState(),
      ]);
    } catch {
      body.innerHTML = `<p class="status-text status-text-error">⚠ Could not reach the daemon.</p>`;
      return;
    }

    this.inputs = capabilities.inputs ?? [];
    this.audioInputs = capabilities.audioInputs ?? [];
    this.platform = capabilities.platform ?? '';
    this.hasAudio = this.audioInputs.length > 0;
    this.audioDevicesUrl = audioDevicesUrlFrom(state);

    this.currentActiveInputName = config.activeInputName ?? '';
    this.currentActiveAudioInputName = config.activeAudioInputName ?? '';
    this.mode = modeFromConfig(config);
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
    if (!isModeConfigValid(config, this.inputs, this.audioInputs)) {
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

    const flags = flagsForMode(this.mode);

    // Zone Mapping is skipped when nothing samples zones (probeState() in
    // app.js checks samplesZones) -- this just explains why, since
    // otherwise a NUX user would wonder why they never see that step.
    const audioNoteHtml = !flags.samplesZones
      ? `<p class="status-text">Zones react together in Audio mode — there's no per-zone mapping step.</p>`
      : '';

    const errorHtml = renderReloadError(this.error, this.platform);

    body.innerHTML = `
      ${toggleHtml}
      ${audioNoteHtml}
      <div class="md-device"></div>
      ${errorHtml}
    `;

    if (this.hasAudio) {
      applyTooltip(body.querySelector('#md-mode-video'), 'app.mode');
      applyTooltip(body.querySelector('#md-mode-audio'), 'app.mode');
      body.querySelector('#md-mode-video').addEventListener('click', () => this._switchMode('video'));
      body.querySelector('#md-mode-audio').addEventListener('click', () => this._switchMode('audio'));
    }

    const deviceSlot = body.querySelector('.md-device');
    this.deviceField = new DeviceField(deviceSlot, {
      usesVideoInput: flags.usesVideoInput,
      usesAudioInput: flags.usesAudioInput,
      audioDevicesUrl: this.audioDevicesUrl,
      monitors: this.monitors,
      selectedMonitorName: this.selectedMonitorName,
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
    // The apply can take seconds (a mode switch rebuilds the pipeline
    // server-side) -- show busy state while awaiting it, or the button
    // reads as dead. No restore needed: the apply's own trailing _render
    // rebuilds this footer fresh before navigation runs.
    const button = this.container.querySelector('.nav-footer-continue');
    if(button){
      button.disabled = true;
      button.textContent = 'Applying…';
    }
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

    const patch = modeSwitchPatch(this.mode, this);

    try {
      const result = await (await fetch('/api/config', {
        method: 'PUT',
        body: JSON.stringify(patch),
      })).json();

      if (!result.succeeded) {
        this.error = "Couldn't save capture settings.";
      } else if (result.reloadError) {
        // Kept raw (no "Saved, but..." framing) when it's the mac
        // permission case -- renderReloadError() detects the prefix and
        // shows its own guided text instead; framed here otherwise, same
        // sentence as before.
        this.error = (this.platform === 'mac' && parseMacPermissionError(result.reloadError))
          ? result.reloadError
          : `Saved, but couldn't apply it live: ${result.reloadError}`;
      } else {
        // An audio switch clears activeInputName but keeps the remembered
        // video input, so switching back picks the same one.
        if (patch.activeInputName) this.currentActiveInputName = patch.activeInputName;
        if (patch.activeAudioInputName) this.currentActiveAudioInputName = patch.activeAudioInputName;
        if (flagsForMode(this.mode).usesVideoInput) {
          // Now resolvable within this same screen visit, since the mode just
          // applied live instead of waiting for Continue -- refetch so a real
          // monitor list can replace the "Auto (primary)" placeholder.
          try {
            const monitorsResult = await (await fetch('/api/monitors')).json();
            this.monitors = monitorsResult.monitors ?? [];
          } catch {
            this.monitors = [];
          }
        }
      }
    } catch {
      this.error = "Couldn't reach the daemon.";
    }

    this._render();
  }
}
