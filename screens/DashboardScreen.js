// Dashboard, filled in: the quick mode toggle and Stop button now sit above
// the nav rows the shell already had (step 9), now that /api/config's mode
// switch (step 12) and /api/stop (step 16) both exist for real. See
// Analysis/WebUIAnalysis.md's Dashboard section and build-order step 17 --
// the natural last piece, since everything it links to and controls needed
// to already exist first.
//
// The original layout mockup still drew a "⏸ Pause" button next to the
// toggle and Stop, left over from before this doc's own Dashboard section
// explicitly cut Pause for v1 ("Orchestrator has no concept of holding
// without exiting its loop") -- another instance of this plan doc's own
// sections drifting out of sync with each other (see
// Analysis/lessons/web-ui.md). Not built here, per that already-made cut.
//
// Status pill: the mockup's own "● Streaming" wording claims a live
// DTLS-connection health signal Aurora doesn't have and can't honestly show
// -- `HueOutput::init()` succeeding is not proof a real streaming
// connection exists (DtlsClient's handshake failure is swallowed by
// design, see Analysis/lessons/output.md). Shows "● Running" instead once
// this screen's own capabilities probe succeeds -- an honest claim (this
// screen only renders because the daemon answered), not a fabricated one
// about a connection state nothing here can actually verify.
//
// Mode toggle reuses ModeDeviceScreen's own pickVideoInputName/
// pickAudioInputName -- the same "resolve the real registry name behind
// Video/Audio" logic, not a second copy of it. Unlike that screen's own
// Done button, this quick toggle has no device-picking step: it's the fast
// one-tap switch the mockup calls for, using whatever device was already
// configured.
import { renderTopBar } from '../topBar.js';
import { OutputConnectScreen } from './OutputConnectScreen.js';
import { ModeDeviceScreen, pickVideoInputName, pickAudioInputName } from './ModeDeviceScreen.js';
import { TuningScreen } from './TuningScreen.js';
import { ZoneMappingScreen } from './ZoneMappingScreen.js';

export class DashboardScreen {
  constructor(app) {
    this.app = app;
    this.mode = 'video';
    this.hasAudio = false;
    this.inputs = [];
    this.audioInputs = [];
    this.currentActiveInputName = '';
    this.currentActiveAudioInputName = '';
    this.toggleError = null;
    this.stopPhase = null; // null | 'confirm' | 'stopped' | 'error'
    this.stopError = null;
  }

  async mount(container) {
    this.container = container;
    container.innerHTML = `
      <div class="top-bar-slot"></div>
      <div class="db-controls"></div>
      <div class="nav-rows">
        <button type="button" class="nav-row" data-nav="bridge">
          <span class="nav-row-label">Bridge — …</span>
          <span class="nav-row-chevron" aria-hidden="true">&#8250;</span>
        </button>
        <button type="button" class="nav-row" data-nav="capture-source">
          <span class="nav-row-label">Capture source — …</span>
          <span class="nav-row-chevron" aria-hidden="true">&#8250;</span>
        </button>
        <button type="button" class="nav-row" data-nav="zones">
          <span class="nav-row-label">Zones — …</span>
          <span class="nav-row-chevron" aria-hidden="true">&#8250;</span>
        </button>
        <button type="button" class="nav-row" data-nav="tuning">
          <span class="nav-row-label">Tuning — Adjust</span>
          <span class="nav-row-chevron" aria-hidden="true">&#8250;</span>
        </button>
      </div>
      <div id="db-overlay-slot"></div>
    `;

    renderTopBar(container.querySelector('.top-bar-slot'), {
      title: 'Aurora',
      showBack: false,
      onSettings: () => this.app.openSettings(),
    });

    container.querySelector('[data-nav="capture-source"]').addEventListener('click', () => {
      this.app.navigate(new ModeDeviceScreen(this.app, {
        onComplete: () => this.app.navigate(new DashboardScreen(this.app)),
      }));
    });
    container.querySelector('[data-nav="zones"]').addEventListener('click', () => {
      this.app.navigate(new ZoneMappingScreen(this.app, {
        onComplete: () => this.app.navigate(new DashboardScreen(this.app)),
      }));
    });
    container.querySelector('[data-nav="tuning"]').addEventListener('click', () => {
      this.app.navigate(new TuningScreen(this.app, {
        onComplete: () => this.app.navigate(new DashboardScreen(this.app)),
      }));
    });

    await this._loadStatus(container);
  }

  unmount() {}

  // Capability-probe + persisted-state check -- this step's own "wired to
  // the capability-probe/persisted-state routing logic," using the real
  // endpoints that already exist. The Bridge row's click target itself
  // depends on this check too: it's disabled outright when this build has
  // no Hue output at all, real (OutputConnectScreen) otherwise. Capture
  // source and Zones have no compiled-in gate to check (a "dummy" video
  // input always exists, and the Zones row is always reachable -- the
  // screen itself shows an honest empty/unavailable state), only a status
  // label to fill in from /api/config and /api/zones respectively.
  async _loadStatus(container) {
    const bridgeRow = container.querySelector('[data-nav="bridge"]');
    const bridgeLabel = bridgeRow.querySelector('.nav-row-label');
    const captureLabel = container.querySelector('[data-nav="capture-source"] .nav-row-label');
    const zonesLabel = container.querySelector('[data-nav="zones"] .nav-row-label');

    let capabilities;
    try {
      capabilities = await (await fetch('/api/capabilities')).json();
    } catch {
      bridgeLabel.textContent = 'Bridge — Status unavailable';
      bridgeRow.disabled = true;
      captureLabel.textContent = 'Capture source — Status unavailable';
      zonesLabel.textContent = 'Zones — Status unavailable';
      return;
    }

    renderTopBar(container.querySelector('.top-bar-slot'), {
      title: 'Aurora',
      showBack: false,
      statusPill: 'Running',
      onSettings: () => this.app.openSettings(),
    });

    if (!capabilities.outputs?.includes('hue')) {
      bridgeLabel.textContent = 'Bridge — not available in this build';
      bridgeRow.disabled = true;
    } else {
      bridgeRow.addEventListener('click', () => {
        this.app.navigate(new OutputConnectScreen(this.app, {
          onComplete: () => this.app.navigate(new DashboardScreen(this.app)),
        }));
      });

      try {
        const connection = await (await fetch('/api/hue/connection')).json();
        bridgeLabel.textContent = connection.configured ? 'Bridge — Connected' : 'Bridge — Not connected';
      } catch {
        bridgeLabel.textContent = 'Bridge — Status unavailable';
      }
    }

    this.inputs = capabilities.inputs ?? [];
    this.audioInputs = capabilities.audioInputs ?? [];
    this.hasAudio = this.audioInputs.length > 0;

    try {
      const config = await (await fetch('/api/config')).json();
      this.currentActiveInputName = config.activeInputName ?? '';
      this.currentActiveAudioInputName = config.activeAudioInputName ?? '';
      this.mode = (!this.currentActiveInputName && this.currentActiveAudioInputName) ? 'audio' : 'video';
      captureLabel.textContent = `Capture source — ${this.mode === 'audio' ? 'Audio' : 'Video'}`;
    } catch {
      captureLabel.textContent = 'Capture source — Status unavailable';
    }

    try {
      const zonesResult = await (await fetch('/api/zones')).json();
      if (!zonesResult.outputName) {
        zonesLabel.textContent = 'Zones — Not available in Audio mode';
      } else if (zonesResult.zones.length === 0) {
        zonesLabel.textContent = 'Zones — None yet';
      } else {
        const activeCount = zonesResult.zones.filter((z) => z.active).length;
        zonesLabel.textContent = `Zones — ${activeCount} active`;
      }
    } catch {
      zonesLabel.textContent = 'Zones — Status unavailable';
    }

    this._renderControls();
  }

  _renderControls() {
    const controls = this.container.querySelector('.db-controls');
    const toggleHtml = this.hasAudio ? `
      <div class="segmented" role="group" aria-label="Capture mode">
        <button type="button" class="segmented-btn${this.mode === 'video' ? ' active' : ''}" id="db-mode-video">Video</button>
        <button type="button" class="segmented-btn${this.mode === 'audio' ? ' active' : ''}" id="db-mode-audio">Audio</button>
      </div>
    ` : '<span></span>';
    const errorHtml = this.toggleError ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.toggleError)}</p>` : '';

    controls.innerHTML = `
      <div class="db-controls-row">
        ${toggleHtml}
        <button type="button" class="btn btn-secondary" id="db-stop">Stop</button>
      </div>
      ${errorHtml}
    `;

    if (this.hasAudio) {
      controls.querySelector('#db-mode-video').addEventListener('click', () => this._switchMode('video'));
      controls.querySelector('#db-mode-audio').addEventListener('click', () => this._switchMode('audio'));
    }
    controls.querySelector('#db-stop').addEventListener('click', () => this._openStopConfirm());
  }

  async _switchMode(mode) {
    if (mode === this.mode) return;

    const patch = mode === 'video'
      ? { activeInputName: pickVideoInputName(this.inputs, this.currentActiveInputName) }
      : { activeInputName: '', activeAudioInputName: pickAudioInputName(this.audioInputs, this.currentActiveAudioInputName) };

    this.toggleError = null;
    try {
      const result = await (await fetch('/api/config', {
        method: 'PUT',
        body: JSON.stringify(patch),
      })).json();

      if (!result.succeeded) {
        this.toggleError = "Couldn't switch modes.";
      } else if (result.reloadError) {
        this.toggleError = `Couldn't apply it live: ${result.reloadError}`;
      } else {
        this.mode = mode;
      }
    } catch {
      this.toggleError = "Couldn't reach the daemon.";
    }

    // Refreshes everything (including the nav-row labels for Capture
    // source/Zones) from the real endpoints rather than guessing the new
    // text locally -- its own trailing _renderControls() picks up
    // this.toggleError too, whether the switch succeeded or not.
    await this._loadStatus(this.container);
  }

  // Ported close to verbatim from huenicorn's own real WebUI.js:
  // _askStopConfirmation() shows a confirm/cancel overlay; _stop() POSTs
  // /api/stop and swaps to a static "stopped" section on success -- no
  // further navigation, since the daemon process (including this same
  // server) is exiting. See build-order step 16 for the backend half.
  _openStopConfirm() {
    this.stopPhase = 'confirm';
    this.stopError = null;
    this._renderStopOverlay();
  }

  _closeStopOverlay() {
    this.stopPhase = null;
    this._renderStopOverlay();
  }

  _renderStopOverlay() {
    const slot = this.container.querySelector('#db-overlay-slot');

    if (this.stopPhase === null) {
      slot.innerHTML = '';
      return;
    }

    if (this.stopPhase === 'confirm') {
      const errorHtml = this.stopError ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.stopError)}</p>` : '';
      slot.innerHTML = `
        <div class="overlay">
          <div class="overlay-scrim" id="db-stop-scrim"></div>
          <div class="overlay-panel">
            <h2>Stop Aurora?</h2>
            <p class="status-text">This shuts down the daemon. You'll need to start it again manually.</p>
            ${errorHtml}
            <div class="overlay-actions">
              <button type="button" class="btn btn-secondary" id="db-stop-cancel">Cancel</button>
              <button type="button" class="btn btn-primary" id="db-stop-confirm">Stop</button>
            </div>
          </div>
        </div>
      `;
      slot.querySelector('#db-stop-scrim').addEventListener('click', () => this._closeStopOverlay());
      slot.querySelector('#db-stop-cancel').addEventListener('click', () => this._closeStopOverlay());
      slot.querySelector('#db-stop-confirm').addEventListener('click', (e) => this._confirmStop(e.currentTarget));
      return;
    }

    // 'stopped': a dead end by design, matching huenicorn's own real
    // behavior -- the server that would answer any further request is
    // already on its way out.
    slot.innerHTML = `
      <div class="overlay">
        <div class="overlay-panel">
          <h2>Aurora has stopped</h2>
          <p class="status-text">Close this page. Start the daemon again to reconnect.</p>
        </div>
      </div>
    `;
  }

  async _confirmStop(button) {
    button.disabled = true;
    this.stopError = null;

    try {
      const result = await (await fetch('/api/stop', { method: 'POST' })).json();
      if (!result.succeeded) {
        this.stopError = "Couldn't stop Aurora.";
        button.disabled = false;
        this._renderStopOverlay();
        return;
      }
      this.stopPhase = 'stopped';
      this._renderStopOverlay();
    } catch {
      this.stopError = "Couldn't reach the daemon.";
      button.disabled = false;
      this._renderStopOverlay();
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
