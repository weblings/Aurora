// Dashboard, rebuilt as the accordion hub (docs/WebUI/
// WebUI_Design_2ndPass.md, step 20): three collapsible sections (Zone
// Mapping, Tuning, Bridge -- the first added in a 2.5-pass correction,
// pulled out of what used to be video's own always-visible top tier) plus
// DeviceField, always collapsed either mode. Capture Source's old nav row
// is gone entirely -- its one real field (DeviceField) now lives directly
// in the top tier.
//
// Sections follow what the running pipeline uses (GET /api/state flags via
// CaptureSource.js, Aurora-kea), not the Video/Audio mode in config: after a
// failed switch they keep showing what still runs. The toggle's fill does
// too (Aurora-axoz): a click only outlines the choice while the switch is
// in flight, and the fill moves only once the running flags confirm it.
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
import { DeviceField, AUTO_MONITOR_VALUE } from '../DeviceField.js';
import { EntertainmentConfigSelect } from '../EntertainmentConfigSelect.js';
import { ZoneCanvas } from '../ZoneCanvas.js';
import { ZoneActiveToggleList } from '../ZoneActiveToggle.js';
import { screenDivisionRects } from '../ScreenDivision.js';
import { AccordionSection } from '../AccordionSection.js';
import { TuningFields } from '../TuningFields.js';
import { applyTooltip } from '../Tooltips.js';
import { renderReloadError, parseMacPermissionError, renderAudioPermissionBanner } from '../MacPermissionRecovery.js';
import {
  audioDevicesUrlFrom, devicePatch, effectiveFlags, flagsForMode, isSwitchConfirmed, isSwitchErrorStale,
  loadPipelineState, modeFromFlags, modeSwitchPatch,
} from '../CaptureSource.js';
import { DAEMON_UNREACHABLE } from '../messages.js';

export class DashboardScreen {
  constructor(app) {
    this.app = app;
    this.mode = 'video';
    this.hasAudio = false;
    this.inputs = [];
    this.audioInputs = [];
    this.platform = '';
    this.currentActiveInputName = '';
    this.currentActiveAudioInputName = '';
    this.monitors = [];
    this.selectedMonitorName = AUTO_MONITOR_VALUE;
    this.flags = flagsForMode('video');
    this.pipelineState = null;
    this.pendingMode = null; // toggle choice with a switch in flight: outlined, not filled
    this.audioDevicesUrl = null;
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
    this.toggleErrorMode = null; // the mode the failed switch was heading to (Aurora-tazx)
    this.topTierError = null;
    this.stopPhase = null; // null | 'confirm' | 'stopped' | 'error'
    this.stopError = null;
    this.paused = false; // from GET /api/state (Aurora-5ipy.13), falls back to capabilities
    this.pauseBusy = false; // a PUT /api/state is in flight: pause button disabled, not hidden
    this.heartbeatTimer = null;
    this.audioStatusTimer = null;
    this.audioPermissionLikelyDenied = false;
    this.audioSinkStatus = null;

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
      <div class="db-version"></div>
    `;
    renderTopBar(container.querySelector('.top-bar-slot'), { title: 'Aurora', logo: { src: 'icons/aurora-logo.png', alt: 'Aurora' }, showBack: false });

    await this._loadAll();
    this._startHeartbeat();
    this._startAudioStatusPoll();
  }

  unmount() {
    this._stopHeartbeat();
    this._stopAudioStatusPoll();
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
      topTier.innerHTML = `<p class="status-text status-text-error">⚠ ${DAEMON_UNREACHABLE}</p>`;
      return false;
    }

    this.hasHue = capabilities.outputs?.includes('hue') ?? false;
    this.inputs = capabilities.inputs ?? [];
    this.audioInputs = capabilities.audioInputs ?? [];
    this.platform = capabilities.platform ?? '';
    this.hasAudio = this.audioInputs.length > 0;

    this.paused = capabilities.paused === true;
    this._renderTopBar();

    // Version footer (Aurora-qdk): secondary-color text at the page bottom
    // (see .db-version in dashboard.css). A failed probe leaves the slot
    // empty rather than a broken label.
    try {
      const { version } = await (await fetch('/api/version')).json();
      if (version) {
        this.container.querySelector('.db-version').innerHTML = `<p>v${escapeHtml(version)}</p>`;
      }
    } catch {
      // No daemon, no version -- the slot stays empty.
    }

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

    let config = {};
    try {
      config = await (await fetch('/api/config')).json();
      this.currentActiveInputName = config.activeInputName ?? '';
      this.currentActiveAudioInputName = config.activeAudioInputName ?? '';
      this.selectedMonitorName = config.activeMonitorName || AUTO_MONITOR_VALUE;
      this.sinkName = config.audioTargetSinkName || '';
      this.tuningValues = config;
    } catch {
      this.tuningValues = {};
    }

    const state = await loadPipelineState();
    this.pipelineState = state;
    // GET /api/state is the fresher paused word than capabilities (both
    // carry it); fall back only when the state probe missed entirely.
    if (state && typeof state.paused === 'boolean') this.paused = state.paused;
    this._renderTopBar();
    this.flags = effectiveFlags(state, config);
    // The toggle's fill follows the running pipeline, never the saved
    // config: after a failed switch config holds the failed mode.
    this.mode = modeFromFlags(this.flags);
    // A switch error lasts until the pipeline is running the mode it was
    // heading to (Aurora-tazx): a confirmed switch, or a resume/relaunch
    // that starts the saved mode the failed switch left in config.
    if (this.toggleError && isSwitchErrorStale(state, this.toggleErrorMode)) {
      this.toggleError = null;
      this.toggleErrorMode = null;
    }
    this.audioDevicesUrl = audioDevicesUrlFrom(state);

    if (this.flags.usesVideoInput) {
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
    return true;
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
  // The toggle's fill follows the running pipeline (this.flags), never the
  // saved config. While a switch is in flight the clicked option gets an
  // outline only (pending), the running option stays filled, and both
  // buttons are disabled -- a ~4.5s rebuild with no busy state reads as a
  // dead button.
  _renderControls() {
    const controls = this.container.querySelector('.db-controls');
    if (!this.hasAudio) {
      controls.innerHTML = '';
      return;
    }

    const errorHtml = renderReloadError(this.toggleError, this.platform);
    const disabled = this.pendingMode ? ' disabled' : '';

    controls.innerHTML = `
      <div class="db-controls-row">
        <div class="segmented" role="group" aria-label="Capture mode">
          <button type="button" class="${this._toggleClasses('video')}" id="db-mode-video"${disabled}>Video</button>
          <button type="button" class="${this._toggleClasses('audio')}" id="db-mode-audio"${disabled}>Audio</button>
        </div>
      </div>
      ${errorHtml}
    `;

    applyTooltip(controls.querySelector('#db-mode-video'), 'app.mode');
    applyTooltip(controls.querySelector('#db-mode-audio'), 'app.mode');
    controls.querySelector('#db-mode-video').addEventListener('click', () => this._switchMode('video'));
    controls.querySelector('#db-mode-audio').addEventListener('click', () => this._switchMode('audio'));
  }

  _toggleClasses(mode) {
    const classes = ['segmented-btn'];
    if (mode === 'video' ? this.flags.usesVideoInput : this.flags.usesAudioInput) {
      classes.push('active');
    }
    if (this.pendingMode === mode) classes.push('pending');
    return classes.join(' ');
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

    const errorHtml = renderReloadError(this.topTierError, this.platform);
    // Only shown absent a reload or switch error -- a real failure is the
    // more actionable, more specific problem when both could apply, and the
    // user should see one message (Aurora-tazx).
    const audioPermissionHtml = !this.topTierError && !this.toggleError && this.flags.usesAudioInput
      ? renderAudioPermissionBanner(this.audioPermissionLikelyDenied)
      : '';

    topTier.innerHTML = `
      <div class="db-device-slot"></div>
      ${errorHtml}
      ${audioPermissionHtml}
    `;

    this.deviceField = new DeviceField(topTier.querySelector('.db-device-slot'), {
      usesVideoInput: this.flags.usesVideoInput,
      usesAudioInput: this.flags.usesAudioInput,
      audioDevicesUrl: this.audioDevicesUrl,
      monitors: this.monitors,
      selectedMonitorName: this.selectedMonitorName,
      sinkName: this.sinkName,
      // The hint ("once Video connects") reads wrong beside an error about
      // that same input -- Screen Recording denied is blocked, not connecting.
      showHint: !this.topTierError && !this.toggleError,
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

    const showZoneRow = this.flags.samplesZones && this.outputName && this.zones.length > 0;

    content.innerHTML = showZoneRow ? `
      <div class="db-zone-actions">
        <button type="button" class="btn btn-secondary" id="db-auto-divide">Auto-arrange zones</button>
      </div>
      <div class="db-canvas-slot"></div>
    ` : '<p class="status-text">Zone mapping isn\'t available right now -- it needs an active output and screen capture running.</p>';

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
        this.topTierError = DAEMON_UNREACHABLE;
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
      usesVideoInput: this.flags.usesVideoInput,
      usesAudioInput: this.flags.usesAudioInput,
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

    const apiPatch = devicePatch(this.flags, this);

    try {
      const result = await (await fetch('/api/config', {
        method: 'PUT',
        body: JSON.stringify(apiPatch),
      })).json();

      if (!result.succeeded) {
        this.topTierError = "Couldn't save capture settings.";
        this._renderTopTier();
      } else if (result.reloadError) {
        // Kept raw (no framing) for the mac permission case -- renderReloadError()
        // detects the prefix and shows its own guided text instead.
        this.topTierError = (this.platform === 'mac' && parseMacPermissionError(result.reloadError))
          ? result.reloadError
          : `Saved, but couldn't apply it live: ${result.reloadError}`;
        this._renderTopTier();
      }
    } catch {
      this.topTierError = DAEMON_UNREACHABLE;
      this._renderTopTier();
    }
  }

  async _switchMode(mode) {
    if (this.pendingMode || mode === this.mode) return;

    const patch = modeSwitchPatch(mode, this);
    const modeLabel = mode === 'audio' ? 'Audio' : 'Video';

    // Outline the clicked option and disable both buttons while the rebuild
    // runs; the running option stays filled until the pipeline confirms.
    // An earlier switch error stays up while the retry runs and clears only
    // when a switch is confirmed (Aurora-tazx); the outline is the busy cue.
    this.pendingMode = mode;
    this._renderControls();

    let putResult = null;
    let unreachable = false;
    try {
      putResult = await (await fetch('/api/config', {
        method: 'PUT',
        body: JSON.stringify(patch),
      })).json();

      if (!putResult.succeeded) {
        this._setToggleError(`Couldn't switch to ${modeLabel}.`, mode);
      } else if (putResult.reloadError) {
        this._setToggleError((this.platform === 'mac' && parseMacPermissionError(putResult.reloadError))
          ? putResult.reloadError
          : `Couldn't switch to ${modeLabel}: ${putResult.reloadError}`, mode);
      }
    } catch {
      unreachable = true;
    }

    // Refreshes everything from the real endpoints rather than guessing the
    // new state locally -- also what resets both AccordionSections to
    // collapsed (see this file's header comment), and its own trailing
    // _renderControls() picks up this.toggleError too either way. _loadAll
    // re-derives the fill from the still-running pipeline on failure, so a
    // failed mode never sticks as filled even though config saved it.
    const loaded = await this._loadAll();

    // The PUT could not reach the daemon: _loadAll's own message (and then
    // the heartbeat's 'Aurora has stopped' overlay) owns that case, so no
    // second message here (Aurora-jm6s). Only when the daemon answers again
    // does the failed switch still need its own error.
    if (unreachable && loaded) {
      this._setToggleError(DAEMON_UNREACHABLE, mode);
      this._renderTopTier();
    }

    // The fill moves only when the running pipeline agrees with the choice:
    // succeeded + no reloadError is not enough, since reload() while paused
    // succeeds without building (Pipeline.cpp). _loadAll already set the
    // fill from the flags, so this just records the confirmed running mode.
    const confirmed = isSwitchConfirmed(putResult, this.pipelineState, mode);
    if (confirmed) {
      this.mode = mode;
      this.toggleError = null;
      this.toggleErrorMode = null;
    }
    this.pendingMode = null;
    this._renderControls();
    // The audio banner is gated on toggleError, so it re-renders when one clears.
    if (confirmed) this._renderTopTier();
  }

  _setToggleError(message, mode) {
    this.toggleError = message;
    this.toggleErrorMode = mode;
  }

  // Top bar with the Pause/Resume + Stop pair (Aurora-5ipy.13). Pause sits
  // next to power; icons are RockyRoad's play/pause glyphs (white fills for
  // the dark buttons), and Stop keeps the power glyph on a lighter grey so
  // the two adjacent icon buttons don't read as one control. Tooltips land
  // on the buttons themselves (not the inner icons), where the hover does.
  _renderTopBar() {
    const slot = this.container.querySelector('.top-bar-slot');
    renderTopBar(slot, {
      title: 'Aurora',
      logo: { src: 'icons/aurora-logo.png', alt: 'Aurora' },
      showBack: false,
      trailingButtons: [
        {
          id: 'top-bar-pause-btn',
          label: this.paused ? 'Resume' : 'Pause',
          icon: this.paused ? 'icons/play-rockyroad.svg' : 'icons/pause-rockyroad.svg',
          onClick: () => this._togglePause(),
          disabled: this.pauseBusy,
        },
        {
          id: 'top-bar-stop-btn',
          label: 'Stop',
          icon: 'icons/power-svgrepo-com.svg',
          onClick: () => this._openStopConfirm(),
          buttonClass: 'btn btn-icon top-bar-power-btn',
        },
      ],
    });
    applyTooltip(slot.querySelector('#top-bar-pause-btn'), 'app.pause');
    applyTooltip(slot.querySelector('#top-bar-stop-btn'), 'app.stop');
  }

  // Pause tears the pipeline down but leaves the daemon up (Aurora-3ddb);
  // resume rebuilds from disk. Reloads everything after the PUT so sections
  // follow the running pipeline, same as a mode switch.
  async _togglePause() {
    if (this.pauseBusy) return;
    this.pauseBusy = true;
    this._renderTopBar();
    try {
      const result = await (await fetch('/api/state', {
        method: 'PUT',
        body: JSON.stringify({ running: this.paused }),
      })).json();
      if (!result || result.succeeded !== true) {
        this.topTierError = this.paused ? "Couldn't resume Aurora." : "Couldn't pause Aurora.";
        this._renderTopTier();
        return;
      }
      await this._loadAll();
    } catch {
      this.topTierError = DAEMON_UNREACHABLE;
      this._renderTopTier();
    } finally {
      this.pauseBusy = false;
      this._renderTopBar();
    }
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

  // A tray/quit-initiated shutdown kills the server out from under an
  // already-open tab -- without this, the Dashboard would sit on a
  // live-looking UI until the next click fails. /api/capabilities is
  // static (no pipeline locks), so a failed poll means the daemon is
  // gone, not slow. Recursive setTimeout (never setInterval) so a hung
  // server cannot stack overlapping polls; the 2.5s abort sits inside
  // the 3s cadence for the same reason.
  _startHeartbeat() {
    this._stopHeartbeat();
    const beat = async () => {
      if(this.heartbeatTimer === null){
        return;
      }
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        try {
          await (await fetch('/api/capabilities', { signal: controller.signal })).json();
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        this._stopHeartbeat();
        if(this.stopPhase !== 'stopped'){
          this.stopPhase = 'stopped';
          this._renderStopOverlay();
        }
        return;
      }
      if(this.heartbeatTimer === null){
        return;
      }
      this.heartbeatTimer = setTimeout(beat, 3000);
    };
    this.heartbeatTimer = setTimeout(beat, 3000);
  }


  _stopHeartbeat() {
    if(this.heartbeatTimer !== null){
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }


  // Separate from _startHeartbeat() on purpose (Aurora-9z4.7) -- that poll
  // is deliberately lock-free (its own comment), so this deliberately
  // doesn't ride along on the same tick even though both hit the server;
  // a slower, non-critical cadence (5s, vs. the heartbeat's 3s) since this
  // is a diagnostic, not a liveness check. No-ops (just reschedules)
  // outside Mac/Linux audio mode -- cheap to leave running across mode
  // switches rather than starting/stopping it from _switchMode too.
  _startAudioStatusPoll() {
    this._stopAudioStatusPoll();
    const poll = async () => {
      if(this.audioStatusTimer === null){
        return;
      }

      // Per-platform audio-status route: Mac reports permission state,
      // Linux reports the sink actually in use (Aurora-4vf). Other
      // platforms (Windows) have no such route -- null skips the fetch.
      const audioStatusUrl = this.platform === 'mac' ? '/api/mac/audio-status'
        : this.platform === 'linux' ? '/api/linux/audio-status'
        : null;

      if(audioStatusUrl && this.flags.usesAudioInput){
        try {
          const result = await (await fetch(audioStatusUrl)).json();
          if(this.platform === 'mac'){
            const denied = !!result.permissionLikelyDenied;
            if(denied !== this.audioPermissionLikelyDenied){
              this.audioPermissionLikelyDenied = denied;
              this._renderTopTier();
            }
          }
          else{
            const next = (result && typeof result.sinkName === 'string')
              ? { followingDefault: result.followingDefault === true, sinkName: result.sinkName }
              : null;
            if(JSON.stringify(next) !== JSON.stringify(this.audioSinkStatus)){
              this.audioSinkStatus = next;
              this._renderTopTier();
            }
          }
        } catch {
          // Same-origin poll against our own server -- a failure here
          // means the daemon's gone, which _startHeartbeat's own poll is
          // already handling; nothing extra to do from this one.
        }
      }
      else if(this.audioPermissionLikelyDenied || this.audioSinkStatus){
        // Audio stopped running (or this platform has no status route) -- don't
        // leave a stale banner or sink hint showing if audio mode is
        // re-entered later without a fresh poll landing first.
        this.audioPermissionLikelyDenied = false;
        this.audioSinkStatus = null;
        this._renderTopTier();
      }

      if(this.audioStatusTimer === null){
        return;
      }
      this.audioStatusTimer = setTimeout(poll, 5000);
    };
    this.audioStatusTimer = setTimeout(poll, 5000);
  }


  _stopAudioStatusPoll() {
    if(this.audioStatusTimer !== null){
      clearTimeout(this.audioStatusTimer);
      this.audioStatusTimer = null;
    }
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
      this.stopError = DAEMON_UNREACHABLE;
      button.disabled = false;
      this._renderStopOverlay();
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
