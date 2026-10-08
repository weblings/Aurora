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
import { renderReloadError } from '../MacPermissionRecovery.js';
import {
  audioDevicesUrlFrom, devicePatch, effectiveFlags, flagsForMode, isSwitchConfirmed, isSwitchErrorStale,
  isIdle, loadPipelineState, modeFromFlags, modeSwitchPatch, putModeSwitch, runningFlags,
} from '../CaptureSource.js';
import { DAEMON_UNREACHABLE } from '../messages.js';
// Brand/toggle artwork resolved against this module (screens/ -> ../icons)
// so the same file works from any mount.
const LOGO_URL = new URL('../icons/aurora-logo.png', import.meta.url).href;
const PLAY_URL = new URL('../icons/play-rockyroad.svg', import.meta.url).href;
const PAUSE_URL = new URL('../icons/pause-rockyroad.svg', import.meta.url).href;
const POWER_URL = new URL('../icons/power-svgrepo-com.svg', import.meta.url).href;

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
    // Inline rejected-request errors under the device field, keyed by the
    // control that raised them (Aurora-m0fy): each clears only on its own
    // confirmed result, and every current one renders as its own row.
    this.topTierErrors = {};
    this.stopPhase = null; // null | 'confirm'
    this.stopError = null;
    this.paused = false; // from GET /api/state (Aurora-5ipy.13), falls back to capabilities
    this.hostState = null; // idle | running | paused | failed, from GET /api/state (Aurora-cj11): failed hides Pause entirely, the banner carries the resolve action
    this.pauseBusy = false; // a PUT /api/state is in flight: pause button disabled, not hidden
    this.canStop = true; // host capability from GET /api/state (Aurora-ifkn.3): absent means stoppable, the demo shim answers false
    this.audioStatusTimer = null;
    this.audioSinkStatus = null;

    // A single persistent instance, never recreated on re-render -- its own
    // onChange fires mid-callback, and recreating the instance whose own
    // callback is still on the stack would tear down the very component
    // running it (same hazard ZoneCanvas's onSelect has to avoid).
    this.entertainmentConfigSelect = new EntertainmentConfigSelect({
      onChange: (id, result) => this._onEntertainmentConfigChange(id, result),
      // Aurora-ewyz: an unreachable signal owns no inline error -- the shell
      // takeover owns it. Poke the beat; anything else reports as before.
      onError: (message) => {
        if (message === DAEMON_UNREACHABLE) { this.app.checkNow(); return; }
        this._setTopTierError('entertainmentConfig', message);
      },
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
    renderTopBar(container.querySelector('.top-bar-slot'), { title: 'Aurora', logo: { src: LOGO_URL, alt: 'Aurora' }, showBack: false });

    // Live paused/hostState from the shell's own GET /api/state beat
    // (Aurora-cj11): a tray pause/resume, or a build recovering on its own,
    // updates the top bar without waiting for anything to reload this
    // screen. Single-slot callback (same shape as app.onRecovered) --
    // bound once here so unmount can identify and clear exactly this
    // instance's own handler.
    this._onHeartbeatState = this._onHeartbeatState.bind(this);
    this.app.onStateUpdate = this._onHeartbeatState;

    await this._loadAll();
    this._startAudioStatusPoll();
  }

  unmount() {
    if (this.app.onStateUpdate === this._onHeartbeatState) this.app.onStateUpdate = null;
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
    let capabilities;
    try {
      capabilities = await (await fetch('/api/capabilities')).json();
    } catch {
      // Unreachable owns this (shell takeover, Aurora-ewyz): poke the beat,
      // no inline error.
      this.app.checkNow();
      return false;
    }

    this.hasHue = capabilities.outputs?.includes('hue') ?? false;
    this.inputs = capabilities.inputs ?? [];
    this.audioInputs = capabilities.audioInputs ?? [];
    this.platform = capabilities.platform ?? '';
    // The shell banner needs this too (GET /api/state carries no platform
    // field) to tell a Mac permission row from a generic one.
    this.app.platform = this.platform;
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
    this.hostState = typeof state?.state === 'string' ? state.state : null;
    // Hosts without a Stop path (the demo shim) hide the button; absent
    // means stoppable so old binaries keep showing it (Aurora-ifkn.3).
    this.canStop = state?.canStop !== false;
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

    const errorHtml = Object.values(this.topTierErrors)
      .map((message) => renderReloadError(message, this.platform)).join('');
    topTier.innerHTML = `
      <div class="db-device-slot"></div>
      ${errorHtml}
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
      showHint: Object.keys(this.topTierErrors).length === 0 && !this.toggleError,
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
      onError: (message) => {
        if (message === DAEMON_UNREACHABLE) { this.app.checkNow(); return; }
        this._setTopTierError('zoneCanvas', message);
      },
      onSuccess: () => this._clearTopTierError('zoneCanvas'),
      onSeeAllZones: () => {
        this.bridgeSection.expand();
        this.bridgeSection.content.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      renderActive: true,
      onUnreachable: () => this.app.checkNow(),
      // Toggle-sync (Aurora-ifkn.5): the canvas embeds the selected zone's
      // Active bool while the Bridge section lists every zone -- both over
      // the same shared objects, so a canvas flip re-renders the list.
      onActiveChange: () => this._onZoneCanvasActiveChange(),
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
      this._setTopTierError('autoArrange', 'No active zones to arrange.');
    } else {
      const rects = screenDivisionRects(activeZones.length);
      try {
        const results = await Promise.all(activeZones.map((zone, i) => (
          fetch('/api/zones', {
            method: 'PUT',
            body: JSON.stringify({ zoneId: zone.zoneId, uvs: rects[i] }),
          }).then((r) => r.json())
        )));
        if (results.some((r) => !r.succeeded)) {
          this._setTopTierError('autoArrange', "Couldn't save the auto-arranged zones.");
        } else {
          this._clearTopTierError('autoArrange');
        }
      } catch {
        // Unreachable owns this (shell takeover, Aurora-ewyz): poke the
        // beat, no inline error.
        this.app.checkNow();
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
      onUnreachable: () => this.app.checkNow(),
      onReloadError: () => this.app.checkNow(),
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
        onComplete: () => this.app.navigate(new DashboardScreen(this.app), 'dashboard'),
      }), 'output-connect');
    });
    this.entertainmentConfigSelect.mount(content.querySelector('.db-entertainment-slot'));
    this._renderBridgeZoneList();
  }

  // Toggle-sync pair (Aurora-ifkn.5): the canvas embeds the selected
  // zone's Active bool while the Bridge section lists every zone, both over
  // the same shared zone objects. A canvas flip re-renders the list; a
  // Bridge flip re-syncs the canvas bool in place (no full re-render, which
  // would kill an open zone dropdown). Thin methods (not inline closures) so
  // the contract is unit-testable without a DOM.
  _onZoneCanvasActiveChange() {
    this._renderBridgeZoneList();
  }

  _onBridgeZoneToggle() {
    this.zoneCanvas?.refreshActive();
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
      onError: (message) => {
        if (message === DAEMON_UNREACHABLE) { this.app.checkNow(); return; }
        this._setTopTierError('zoneToggle', message);
      },
      onSuccess: () => this._clearTopTierError('zoneToggle'),
      onUnreachable: () => this.app.checkNow(),
      tooltipKey: 'zones.active',
      // Toggle-sync (Aurora-ifkn.5): a Bridge flip re-syncs the canvas bool
      // in place (no full re-render, which would kill an open dropdown).
      onChange: () => this._onBridgeZoneToggle(),
    });
  }

  // The switch saved, so a rejected one's row clears. A reload that failed
  // after the save is host state: the shell banner owns it (Aurora-98pr);
  // poke the beat for an early redraw.
  async _onEntertainmentConfigChange(_id, { reloadError } = {}) {
    this._clearTopTierError('entertainmentConfig');
    if (reloadError) this.app.checkNow();
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

    const apiPatch = devicePatch(this.flags, this);

    try {
      const result = await (await fetch('/api/config', {
        method: 'PUT',
        body: JSON.stringify(apiPatch),
      })).json();

      if (!result.succeeded) {
        this._setTopTierError('deviceSave', "Couldn't save capture settings.");
      } else {
        this._clearTopTierError('deviceSave');
        // Saved, not applied: the daemon holds the error and the shell
        // banner shows it (Aurora-98pr). Poke the beat for an early redraw.
        if (result.reloadError) this.app.checkNow();
      }
    } catch {
      // Unreachable owns this (shell takeover, Aurora-ewyz): poke the beat,
      // no inline error.
      this.app.checkNow();
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
      putResult = await putModeSwitch(patch);

      if (!putResult.succeeded) {
        this._setToggleError(`Couldn't switch to ${modeLabel}.`, mode);
      } else if (putResult.reloadError) {
        // Saved, not applied: the shell banner owns it (Aurora-98pr); the
        // fill below is re-derived from the still-running pipeline.
        this.app.checkNow();
      }
    } catch {
      unreachable = true;
      this.app.checkNow();
    }

    // Refreshes everything from the real endpoints rather than guessing the
    // new state locally -- also what resets both AccordionSections to
    // collapsed (see this file's header comment), and its own trailing
    // _renderControls() picks up this.toggleError too either way. _loadAll
    // re-derives the fill from the still-running pipeline on failure, so a
    // failed mode never sticks as filled even though config saved it.
    const loaded = await this._loadAll();

    // The PUT could not reach the daemon: the shell takeover owns that case,
    // so no second message here (Aurora-jm6s, Aurora-ewyz). Only when the
    // daemon answers again does the failed switch still need its own error --
    // and then it is the action's error, never the unreachable wording
    // (components.md:308).
    if (unreachable && loaded) {
      this._setToggleError(`Couldn't switch to ${modeLabel}.`, mode);
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

  // topTierErrors owners (Aurora-m0fy): both always repaint the top tier,
  // and a clear only repaints when it removed something.
  _setTopTierError(key, message) {
    this.topTierErrors[key] = message;
    this._renderTopTier();
  }

  _clearTopTierError(key) {
    if (!(key in this.topTierErrors)) return;
    delete this.topTierErrors[key];
    this._renderTopTier();
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
    // A failed host has no pipeline to pause or resume -- Pause silently
    // no-op'd here before Aurora-d3ec/cj11 gave the host an explicit
    // failed state. The banner's Retry is the resolve action now; Pause
    // is hidden entirely rather than shown disabled, same treatment Stop
    // doesn't need since stopping a failed daemon is still meaningful.
    const trailingButtons = [];
    if (this.hostState !== 'failed') {
      trailingButtons.push({
        id: 'top-bar-pause-btn',
        label: this.paused ? 'Resume' : 'Pause',
        icon: this.paused ? PLAY_URL : PAUSE_URL,
        onClick: () => this._togglePause(),
        disabled: this.pauseBusy,
      });
    }
    // Hosts without a Stop path (the demo shim answers canStop: false)
    // get no button at all -- same hidden-entirely treatment as Pause on
    // a failed host, rather than a disabled button to nowhere (Aurora-ifkn.3).
    // Absent reads as stoppable, so old binaries keep the button.
    if (this.canStop !== false) {
      trailingButtons.push({
        id: 'top-bar-stop-btn',
        label: 'Stop',
        icon: POWER_URL,
        onClick: () => this._openStopConfirm(),
        buttonClass: 'btn btn-icon top-bar-power-btn',
      });
    }
    renderTopBar(slot, {
      title: 'Aurora',
      logo: { src: LOGO_URL, alt: 'Aurora' },
      showBack: false,
      trailingButtons,
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
        if (this.paused) {
          // A rejected resume is a failed build: the daemon holds it as a
          // `resume` error and the shell banner shows it (Aurora-98pr).
          this.app.checkNow();
          return;
        }
        this._setTopTierError('pause', "Couldn't pause Aurora.");
        return;
      }
      this._clearTopTierError('pause');
      await this._loadAll();
    } catch {
      // Blip (the daemon answered the re-check): the failed action still
      // needs its own error. Outage: the shell takeover owns it, no inline.
      if (await this.app.checkNow()) {
        this._setTopTierError('pause', this.paused ? "Couldn't resume Aurora." : "Couldn't pause Aurora.");
      }
    } finally {
      this.pauseBusy = false;
      this._renderTopBar();
    }
  }

  // Shell heartbeat push (Aurora-cj11): applies whatever changed and
  // re-renders only the top bar -- never a full _loadAll(), which would
  // fight the beat's own 3s cadence with a second round of requests.
  _onHeartbeatState({ state, paused, canStop, ...flags }) {
    // The running pipeline changed from outside the toggle (a banner Retry,
    // the tray, a relaunch): re-derive the toggle and sections from it, once
    // per change and never while a switch of our own is in flight.
    const flagKey = (f) => `${f.usesVideoInput}|${f.usesAudioInput}|${f.samplesZones}`;
    const running = runningFlags(flags);
    const key = flagKey(running);
    if (!this.pendingMode && !isIdle(running) && key !== flagKey(runningFlags(this.pipelineState)) && key !== this._requestedFlagKey) {
      this._requestedFlagKey = key;
      this._loadAll();
    }
    let changed = false;
    if (typeof paused === 'boolean' && paused !== this.paused) { this.paused = paused; changed = true; }
    if (state !== undefined && state !== this.hostState) { this.hostState = state; changed = true; }
    if (canStop !== undefined && (canStop !== false) !== this.canStop) { this.canStop = canStop !== false; changed = true; }
    if (changed) this._renderTopBar();
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

  }

  // Unreachable watching lives in the shell beat (Aurora-ewyz): one
  // recursive-setTimeout poll for the app's lifetime, on every screen
  // including NUX -- no per-screen timer to start here. The audio poll
  // below stays separate on purpose (Aurora-9z4.7): the beat is
  // deliberately lock-free, so this diagnostic does not ride along on
  // the same tick even though both hit the server.


  // Separate from the shell beat on purpose (Aurora-9z4.7) -- that poll
  // is deliberately lock-free (its own comment), so this deliberately
  // doesn't ride along on the same tick even though both hit the server;
  // a slower, non-critical cadence (5s, vs. the heartbeat's 3s) since this
  // is a diagnostic, not a liveness check. No-ops (just reschedules)
  // outside Linux audio mode -- cheap to leave running across mode
  // switches rather than starting/stopping it from _switchMode too.
  _startAudioStatusPoll() {
    this._stopAudioStatusPoll();
    const poll = async () => {
      if(this.audioStatusTimer === null){
        return;
      }

      // Linux reports the sink actually in use (Aurora-4vf). Mac's audio
      // permission is a daemon-pushed banner row now (Aurora-h457), so no
      // route here; Windows has none either.
      if(this.platform === 'linux' && this.flags.usesAudioInput){
        try {
          const result = await (await fetch('/api/linux/audio-status')).json();
          const next = (result && typeof result.sinkName === 'string')
            ? { followingDefault: result.followingDefault === true, sinkName: result.sinkName }
            : null;
          if(JSON.stringify(next) !== JSON.stringify(this.audioSinkStatus)){
            this.audioSinkStatus = next;
            this._renderTopTier();
          }
        } catch {
          // Same-origin poll against our own server -- a failure here
          // means the daemon's gone, which the shell beat's own poll is
          // already handling; nothing extra to do from this one.
        }
      }
      else if(this.audioSinkStatus){
        // Audio stopped running (or this platform has no status route) -- don't
        // leave a stale sink hint showing if audio mode is re-entered later
        // without a fresh poll landing first.
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
      // The daemon is exiting on purpose: the shell's intentional-stop
      // takeover owns the UI from here (Aurora-ewyz).
      this.app.notifyStopConfirmed();
    } catch {
      if (await this.app.checkNow()) this.stopError = "Couldn't stop Aurora.";
      button.disabled = false;
      this._renderStopOverlay();
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
