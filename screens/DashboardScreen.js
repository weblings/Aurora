// Dashboard, rebuilt as the accordion hub (Analysis/WebUI/
// WebUI_Design_2ndPass.md, step 20): three collapsible sections (Zone
// Mapping, Tuning, Bridge -- the first added in a 2.5-pass correction,
// pulled out of what used to be video's own always-visible top tier) plus
// DeviceField, always collapsed either mode. Capture Source's old nav row
// is gone entirely -- its one real field (DeviceField) now lives directly
// in the top tier, swapped by mode the same way ModeDeviceScreen's own
// _renderVideoDevice/_renderAudioDevice always did.
//
// Mode switch (_switchMode) reuses the same full _loadAll()->_render() path
// as the initial mount -- since _render() always builds fresh
// AccordionSection instances (collapsed by default), resetting all three
// sections on a mode change falls out for free rather than needing its own
// explicit reset call. Everything else (an entertainment-config switch, a
// zone-canvas selection change, a device-field edit) uses a narrower
// refresh instead, so expanding any section to check something doesn't get
// silently collapsed again by an unrelated edit.
import { renderTopBar } from '../topBar.js';
import { OutputConnectScreen } from './OutputConnectScreen.js';
import { ModeDeviceScreen, pickVideoInputName, pickAudioInputName } from './ModeDeviceScreen.js';
import { DeviceField, AUTO_MONITOR_VALUE } from '../DeviceField.js';
import { EntertainmentConfigSelect } from '../EntertainmentConfigSelect.js';
import { ZoneCanvas } from '../ZoneCanvas.js';
import { ZoneActiveToggleList } from '../ZoneActiveToggle.js';
import { screenDivisionRects } from '../ScreenDivision.js';
import { AccordionSection } from '../AccordionSection.js';
import { TuningFields } from '../TuningFields.js';
import { applyTooltip } from '../Tooltips.js';

export class DashboardScreen {
  constructor(app) {
    this.app = app;
    this.mode = 'video';
    this.hasAudio = false;
    this.inputs = [];
    this.audioInputs = [];
    this.currentActiveInputName = '';
    this.currentActiveAudioInputName = '';
    this.monitors = [];
    this.selectedMonitorName = AUTO_MONITOR_VALUE;
    this.showSinkField = false;
    this.sinkName = '';
    this.hasHue = false;
    this.bridgeConfigured = false;
    this.bridgeAddress = '';
    this.outputName = '';
    this.zones = [];
    this.selectedZoneId = null;
    this.channelLightNames = {};
    this.tuningValues = {};
    this.toggleError = null;
    this.topTierError = null;
    this.stopPhase = null; // null | 'confirm' | 'stopped' | 'error'
    this.stopError = null;

    // A single persistent instance, never recreated on re-render -- its own
    // onChange fires mid-callback, and recreating the instance whose own
    // callback is still on the stack would tear down the very component
    // running it (same hazard ZoneCanvas's onSelect has to avoid).
    this.entertainmentConfigSelect = new EntertainmentConfigSelect({
      onChange: () => this._onEntertainmentConfigChange(),
      onError: (message) => { this.topTierError = message; this._renderTopTier(); },
    });

    this.deviceField = null;
    this.zoneCanvas = null;
    this.zoneMappingSection = null;
    this.tuningFields = null;
    this.tuningSection = null;
    this.bridgeSection = null;
  }

  async mount(container) {
    this.container = container;
    container.innerHTML = `
      <div class="top-bar-slot db-top-bar-slot"></div>
      <div class="db-controls"></div>
      <div class="db-top-tier"></div>
      <div class="db-accordions"></div>
      <div id="db-overlay-slot"></div>
    `;
    renderTopBar(container.querySelector('.top-bar-slot'), { title: 'Aurora', showBack: false });

    await this._loadAll();
  }

  unmount() {
    this.entertainmentConfigSelect.destroy();
    this.deviceField?.destroy();
    this.deviceField = null;
    this.zoneCanvas?.destroy();
    this.zoneCanvas = null;
    this.tuningFields?.destroy();
    this.tuningFields = null;
  }

  // Full fetch + full rebuild -- initial mount and mode switch both need
  // every field re-derived (capabilities rarely change, but mode, monitors,
  // zones and tuning values all do). Everything else that changes only one
  // piece of state calls a narrower _render* method instead.
  async _loadAll() {
    const topTier = this.container.querySelector('.db-top-tier');

    let capabilities;
    try {
      capabilities = await (await fetch('/api/capabilities')).json();
    } catch {
      topTier.innerHTML = `<p class="status-text status-text-error">⚠ Could not reach the daemon.</p>`;
      return;
    }

    this.hasHue = capabilities.outputs?.includes('hue') ?? false;
    this.inputs = capabilities.inputs ?? [];
    this.audioInputs = capabilities.audioInputs ?? [];
    this.hasAudio = this.audioInputs.length > 0;
    this.showSinkField = this.audioInputs.includes('linux-audio');

    renderTopBar(this.container.querySelector('.top-bar-slot'), {
      title: 'Aurora',
      showBack: false,
      trailingButton: { label: 'Stop', icon: 'icons/power-svgrepo-com.svg', onClick: () => this._openStopConfirm() },
    });

    if (this.hasHue) {
      try {
        const connection = await (await fetch('/api/hue/connection')).json();
        this.bridgeConfigured = connection.configured === true;
        this.bridgeAddress = connection.bridgeAddress ?? '';
      } catch {
        this.bridgeConfigured = false;
        this.bridgeAddress = '';
      }
    }

    try {
      const config = await (await fetch('/api/config')).json();
      this.currentActiveInputName = config.activeInputName ?? '';
      this.currentActiveAudioInputName = config.activeAudioInputName ?? '';
      this.mode = (!this.currentActiveInputName && this.currentActiveAudioInputName) ? 'audio' : 'video';
      this.selectedMonitorName = config.activeMonitorName || AUTO_MONITOR_VALUE;
      this.sinkName = config.audioTargetSinkName || '';
      this.tuningValues = config;
    } catch {
      this.tuningValues = {};
    }

    if (this.mode === 'video') {
      try {
        this.monitors = (await (await fetch('/api/monitors')).json()).monitors ?? [];
      } catch {
        this.monitors = [];
      }
    } else {
      this.monitors = [];
    }

    await this._loadZoneData();
    this._render();
  }

  // Zones + the entertainment-config picker's own data + channel light
  // names -- split out since an entertainment-config switch needs to
  // refresh exactly this, not a full _loadAll() (capabilities/monitors
  // haven't changed).
  async _loadZoneData() {
    try {
      const zonesResult = await (await fetch('/api/zones')).json();
      this.outputName = zonesResult.outputName ?? '';
      this.zones = zonesResult.zones ?? [];
    } catch {
      this.outputName = '';
      this.zones = [];
    }
    this.selectedZoneId = null;
    this.channelLightNames = {};

    if (this.hasHue) {
      await this.entertainmentConfigSelect.load();
    }

    if (this.outputName) {
      try {
        const channelsResult = await (await fetch('/api/hue/channels')).json();
        if (channelsResult.succeeded) {
          for (const c of channelsResult.channels) this.channelLightNames[c.channelId] = c.lightNames;
        }
      } catch {
        this.channelLightNames = {};
      }
    }
  }

  _zoneLabel(zone) {
    const names = this.channelLightNames?.[zone.zoneId];
    return names?.length ? `Zone ${zone.zoneId} (${names.join(', ')})` : `Zone ${zone.zoneId}`;
  }

  _render() {
    this._renderControls();
    this._renderTopTier();
    this._renderAccordions();
  }

  // Stop moved into the top bar itself (2.5 pass, see _loadAll()'s
  // renderTopBar call) -- this row is now just the mode toggle, so it
  // renders nothing at all for a single-input build with no toggle to show,
  // rather than leaving an empty placeholder row in the DOM.
  _renderControls() {
    const controls = this.container.querySelector('.db-controls');
    if (!this.hasAudio) {
      controls.innerHTML = '';
      return;
    }

    const errorHtml = this.toggleError ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.toggleError)}</p>` : '';

    controls.innerHTML = `
      <div class="db-controls-row">
        <div class="segmented" role="group" aria-label="Capture mode">
          <button type="button" class="segmented-btn${this.mode === 'video' ? ' active' : ''}" id="db-mode-video">Video</button>
          <button type="button" class="segmented-btn${this.mode === 'audio' ? ' active' : ''}" id="db-mode-audio">Audio</button>
        </div>
      </div>
      ${errorHtml}
    `;

    applyTooltip(controls.querySelector('#db-mode-video'), 'app.mode');
    applyTooltip(controls.querySelector('#db-mode-audio'), 'app.mode');
    controls.querySelector('#db-mode-video').addEventListener('click', () => this._switchMode('video'));
    controls.querySelector('#db-mode-audio').addEventListener('click', () => this._switchMode('audio'));
  }

  // Top tier: just DeviceField (Monitor/device picker) + its own error now --
  // Auto-arrange/canvas/zone-row moved into their own "Zone Mapping"
  // accordion (2.5 pass correction: a user request, not part of the
  // original 2.5-pass plan) between this and Tuning/Bridge -- see
  // _renderAccordions()/_renderZoneMappingContent().
  _renderTopTier() {
    const topTier = this.container.querySelector('.db-top-tier');
    this.deviceField?.destroy();
    this.deviceField = null;

    const errorHtml = this.topTierError ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.topTierError)}</p>` : '';

    topTier.innerHTML = `
      <div class="db-device-slot"></div>
      ${errorHtml}
    `;

    this.deviceField = new DeviceField(topTier.querySelector('.db-device-slot'), {
      mode: this.mode,
      monitors: this.monitors,
      selectedMonitorName: this.selectedMonitorName,
      showSinkField: this.showSinkField,
      sinkName: this.sinkName,
      onChange: (patch) => this._onDeviceFieldChange(patch),
    });
  }

  // Auto-arrange + canvas + Zone/Active/Gamma row, inside the Zone Mapping
  // accordion's own content -- split from _renderAccordions() (which only
  // creates the section shell on a full render) so a narrower refresh
  // (auto-divide, an entertainment-config switch, a canvas PUT error) can
  // update this without collapsing an already-expanded section, same split
  // Bridge's own content uses.
  _renderZoneMappingContent() {
    const content = this.zoneMappingSection?.content;
    if (!content) return;
    this.zoneCanvas?.destroy();
    this.zoneCanvas = null;

    const showZoneRow = this.mode === 'video' && this.outputName && this.zones.length > 0;

    content.innerHTML = showZoneRow ? `
      <div class="db-zone-actions">
        <button type="button" class="btn btn-secondary" id="db-auto-divide">Auto-arrange zones</button>
      </div>
      <div class="db-canvas-slot"></div>
    ` : '<p class="status-text">Zone mapping isn\'t available right now -- it needs an active output and Video mode.</p>';

    if (!showZoneRow) return;

    this.zoneCanvas = new ZoneCanvas(content.querySelector('.db-canvas-slot'), {
      zones: this.zones,
      selectedZoneId: this.selectedZoneId,
      zoneLabel: (zone) => this._zoneLabel(zone),
      onSelect: (zoneId) => { this.selectedZoneId = zoneId; },
      onError: (message) => { this.topTierError = message; this._renderTopTier(); },
      onSeeAllZones: () => {
        this.bridgeSection.expand();
        this.bridgeSection.content.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      renderActive: true,
    });
    this.selectedZoneId = this.zoneCanvas.selectedZoneId;

    applyTooltip(content.querySelector('#db-auto-divide'), 'zones.autoArrange');
    content.querySelector('#db-auto-divide').addEventListener('click', (e) => this._onAutoDivideClick(e.currentTarget));
  }

  // Same non-overlapping-region assignment as ZoneMappingScreen's own
  // "Auto-arrange zones" button (ScreenDivision.js) -- duplicated rather than
  // shared since the two screens refresh completely different state
  // afterward (this one re-renders the top tier + bridge zone list, not a
  // single zm-body). Refetches zones afterward rather than trusting any
  // individual PUT response, same reasoning as ZoneMappingScreen's version.
  async _onAutoDivideClick(button) {
    button.disabled = true;
    const activeZones = this.zones.filter((z) => z.active).sort((a, b) => a.zoneId - b.zoneId);

    if (activeZones.length === 0) {
      this.topTierError = 'No active zones to arrange.';
    } else {
      this.topTierError = null;
      const rects = screenDivisionRects(activeZones.length);
      try {
        const results = await Promise.all(activeZones.map((zone, i) => (
          fetch('/api/zones', {
            method: 'PUT',
            body: JSON.stringify({ zoneId: zone.zoneId, uvs: rects[i] }),
          }).then((r) => r.json())
        )));
        if (results.some((r) => !r.succeeded)) {
          this.topTierError = "Couldn't save the auto-arranged zones.";
        }
      } catch {
        this.topTierError = "Couldn't reach the daemon.";
      }
      await this._loadZoneData();
    }

    this._renderZoneMappingContent();
    this._renderBridgeZoneList();
  }

  // Fresh AccordionSection instances every call -- always collapsed, which
  // is exactly what a mode switch's own full _render() needs (see this
  // file's header comment). Only _render() (mount/mode-switch) calls this;
  // narrower refreshes (entertainment-config change) update content inside
  // the already-existing sections instead, preserving whatever the user had
  // expanded.
  _renderAccordions() {
    const wrap = this.container.querySelector('.db-accordions');
    this.zoneCanvas?.destroy();
    this.zoneCanvas = null;
    wrap.innerHTML = `
      <div class="db-accordion-zone-mapping"></div>
      <div class="db-accordion-tuning"></div>
      <div class="db-accordion-bridge"></div>
    `;

    this.zoneMappingSection = new AccordionSection(wrap.querySelector('.db-accordion-zone-mapping'), { title: 'Zone Mapping', expanded: true });
    this._renderZoneMappingContent();

    this.tuningFields?.destroy();
    this.tuningSection = new AccordionSection(wrap.querySelector('.db-accordion-tuning'), { title: 'Tuning', expanded: false });
    this.tuningFields = new TuningFields(this.tuningSection.content, {
      mode: this.mode,
      values: this.tuningValues,
      monitors: this.monitors,
      selectedMonitorName: this.selectedMonitorName,
    });

    this.bridgeSection = new AccordionSection(wrap.querySelector('.db-accordion-bridge'), { title: 'Bridge', expanded: false });
    this._renderBridgeContent();
  }

  _renderBridgeContent() {
    const content = this.bridgeSection.content;
    if (!this.hasHue) {
      content.innerHTML = `<p class="status-text">Not available in this build.</p>`;
      return;
    }

    content.innerHTML = `
      <p class="status-text db-bridge-connected">${this.bridgeConfigured ? `Connected to ${escapeHtml(this.bridgeAddress)}` : 'Not connected'}</p>
      <button type="button" class="btn btn-secondary" id="db-change-bridge">Change bridge</button>
      <div class="db-entertainment-slot"></div>
      <div class="db-bridge-zones-slot"></div>
    `;
    applyTooltip(content.querySelector('#db-change-bridge'), 'output.hue.changeBridge');
    content.querySelector('#db-change-bridge').addEventListener('click', () => {
      this.app.navigate(new OutputConnectScreen(this.app, {
        startAtEntry: true,
        onComplete: () => this.app.navigate(new DashboardScreen(this.app)),
      }));
    });
    this.entertainmentConfigSelect.mount(content.querySelector('.db-entertainment-slot'));
    this._renderBridgeZoneList();
  }

  // The full per-zone list, relocated here from Zone Mapping's own
  // always-visible list (see ZoneActiveToggle.js's header comment) --
  // refreshed whenever zone data changes (initial load, an
  // entertainment-config switch) without recreating bridgeSection itself,
  // so an already-expanded Bridge section doesn't collapse just because the
  // list underneath it changed.
  _renderBridgeZoneList() {
    const slot = this.bridgeSection?.content.querySelector('.db-bridge-zones-slot');
    if (!slot) return;
    slot.innerHTML = '';
    if (this.zones.length === 0) return;
    new ZoneActiveToggleList(slot, {
      zones: this.zones,
      zoneLabel: (zone) => this._zoneLabel(zone),
      onError: (message) => { this.topTierError = message; this._renderTopTier(); },
      tooltipKey: 'zones.active',
    });
  }

  async _onEntertainmentConfigChange() {
    this.topTierError = null;
    await this._loadZoneData();
    this._renderZoneMappingContent();
    this._renderBridgeZoneList();
  }

  // Device field edits PUT immediately, same "every edit already saves"
  // convention Zone Mapping's canvas/toggles use -- this screen draws no
  // Save button for it at all, unlike ModeDeviceScreen's own onboarding use
  // of the same component.
  async _onDeviceFieldChange(patch) {
    Object.assign(this, patch);
    this.topTierError = null;

    const apiPatch = this.mode === 'video'
      ? { activeMonitorName: this.selectedMonitorName }
      : { audioTargetSinkName: this.sinkName.trim() };

    try {
      const result = await (await fetch('/api/config', {
        method: 'PUT',
        body: JSON.stringify(apiPatch),
      })).json();

      if (!result.succeeded) {
        this.topTierError = "Couldn't save capture settings.";
        this._renderTopTier();
      } else if (result.reloadError) {
        this.topTierError = `Saved, but couldn't apply it live: ${result.reloadError}`;
        this._renderTopTier();
      }
    } catch {
      this.topTierError = "Couldn't reach the daemon.";
      this._renderTopTier();
    }
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

    // Refreshes everything from the real endpoints rather than guessing the
    // new state locally -- also what resets both AccordionSections to
    // collapsed (see this file's header comment), and its own trailing
    // _renderControls() picks up this.toggleError too either way.
    await this._loadAll();
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
    // already on its way out. Scrim is purely visual here (no click
    // listener, unlike confirm's) -- there's nothing to cancel back to.
    slot.innerHTML = `
      <div class="overlay">
        <div class="overlay-scrim"></div>
        <div class="overlay-panel">
          <h2>Aurora has stopped</h2>
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
