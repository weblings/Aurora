// Zone Mapping: one canvas showing every zone's UV rect (shape only), a
// zone-picker dropdown + gamma slider for whichever zone is currently
// selected, and a separate active/inactive toggle list below, decoupled
// from shape editing entirely. Ported from huenicorn's real `ScreenWidget.js`
// (`Handle`/`Rectangle` classes, read in full -- see
// Analysis/WebUI/WebUI_Design_1stPass.md's Zone Mapping section and build-order step 15),
// with its two identified real gaps closed: Pointer Events instead of
// mouse-only events (touch support), and a native `<input type="range">`
// gamma slider instead of a second hand-rolled SVG drag control. A third
// gap not in the original research, found while porting: huenicorn's own
// `Handle.setPosition` only clamps to the screen's own bounds, not against
// the *opposite* corner -- dragging a corner past its sibling produces an
// inverted UV rect (min > max), which `ImageProcessing::getSubImage` has no
// defense against (an invalid `cv::Range`, a real crash risk server-side,
// confirmed by reading it, not assumed). This port clamps every drag to a
// minimum 2% rect size against the opposite corner instead.
//
// Active/inactive is a flat toggle list, not huenicorn's two-column
// drag-and-drop -- Aurora's zone count is fixed, not an open-ended
// bridge-light membership problem. See WebUI/WebUI_Fixes.md's Zone Mapping
// follow-up section for why this replaced the old on-canvas checkbox.
//
// The header's own "Save" button does not gate persistence -- every edit
// here (drag, checkbox, gamma) already PUTs immediately, matching
// huenicorn's own real save-on-every-setter feel and step 14's backend
// design (`Orchestrator::updateZone` persists unconditionally, with no
// staged/uncommitted concept at all). "Save" here just means "done editing,
// back to Dashboard" -- resolves an ambiguity the original spec's header
// line left open without saying so.
//
// Entertainment-config picker (above the canvas, matching huenicorn's own
// real WebUI.js layout -- its equivalent dropdown lives on the same main
// screen as its zone/channel mapping, not buried in setup). Added as a
// WebUI/WebUI_Fixes.md follow-up: Output Connect's own pairing wizard had
// no path back to this picker without redoing physical pairing, even with
// valid credentials already saved. Reuses the already-persisted
// bridgeAddress/username server-side (PUT /api/hue/entertainment-
// configurations now falls back to CredentialsStore when the body omits
// them) and writes back through POST /api/hue/connection, now PATCH-style
// so a body with just entertainmentConfigurationId works without the
// frontend ever needing username/clientkey (deliberately withheld by GET
// /api/hue/connection). Hidden entirely at exactly one config, same rule
// huenicorn's own dropdown and Output Connect's already use.
import { renderTopBar } from '../topBar.js';
import { EntertainmentConfigSelect } from '../EntertainmentConfigSelect.js';
import { ZoneCanvas } from '../ZoneCanvas.js';
import { ZoneActiveToggleList } from '../ZoneActiveToggle.js';
import { screenDivisionRects } from '../ScreenDivision.js';

export class ZoneMappingScreen {
  // onboarding: the wizard variant (Analysis/WebUI/WebUI_Design_2ndPass.md
  // step 17) -- no entertainment-config picker UI at all (silently uses
  // whatever load() already resolved a default for) instead of the
  // switchable EntertainmentConfigSelect dropdown, and Auto-arrange/Zone/
  // Active/Gamma arranged the same way as Dashboard's own Zone Mapping
  // (ZoneCanvas's renderActive: true bundles Active in, rather than this
  // screen's own separate always-visible list, still used as-is by the
  // non-onboarding path).
  constructor(app, { onComplete, onBack, showBack = true, onboarding = false }) {
    this.app = app;
    this.onComplete = onComplete;
    this.onBack = onBack ?? onComplete;
    this.showBack = showBack;
    this.onboarding = onboarding;
    this.outputName = '';
    this.zones = null; // null = not loaded yet
    this.selectedZoneId = null;
    this.error = null;
    this.entertainmentConfigSelect = new EntertainmentConfigSelect({
      onChange: () => { this.error = null; this._load(); },
      onError: (message) => { this.error = message; this._render(); },
    });
    this.zoneCanvas = null;
    this.channelLightNames = {}; // channelId -> light name array, from /api/hue/channels
  }

  async mount(container) {
    this.container = container;
    container.innerHTML = `
      <div class="top-bar-slot"></div>
      <div class="zm-body"></div>
    `;
    renderTopBar(container.querySelector('.top-bar-slot'), {
      title: 'Zone mapping',
      showBack: this.showBack,
      onBack: () => this.onBack(),
    });

    await this._load();
  }

  unmount() {
    this.entertainmentConfigSelect.destroy();
    this.zoneCanvas?.destroy();
    this.zoneCanvas = null;
  }

  async _load() {
    const body = this.container.querySelector('.zm-body');
    body.innerHTML = `<p class="status-text">Loading…</p>`;

    try {
      const result = await (await fetch('/api/zones')).json();
      this.outputName = result.outputName ?? '';
      this.zones = result.zones ?? [];
    } catch {
      this.zones = null;
      this.error = "Couldn't reach the daemon.";
    }

    this.selectedZoneId = null;

    if (this.outputName) {
      await this.entertainmentConfigSelect.load();

      // Best-effort: falls back to bare "Zone N" labels (via _zoneLabel) if
      // this fails or the route isn't available for the active output.
      try {
        const channelsResult = await (await fetch('/api/hue/channels')).json();
        this.channelLightNames = {};
        if (channelsResult.succeeded) {
          for (const c of channelsResult.channels) this.channelLightNames[c.channelId] = c.lightNames;
        }
      } catch {
        this.channelLightNames = {};
      }
    }

    // Auto-arrange the first time this screen is ever reached with no zone
    // edit on record at all -- onboarding only, so a returning user's own
    // deliberate arrangement (even one that happens to leave a zone at the
    // full-screen default) is never silently overwritten on a later visit.
    // Runs before the render below rather than after, so there's no visible
    // flash of the raw all-overlapping defaults first.
    if (this.onboarding && this.zones?.length > 0 && this.zones.every((z) => !z.everConfigured)) {
      await this._autoDivide();
    }

    this._render();
  }

  // Assigns each active zone a non-overlapping screen region from
  // ScreenDivision.js instead of leaving it at whatever it was -- used both
  // for the onboarding auto-run above and the manual re-run button in
  // _render(). Refetches the zone list afterward rather than trusting any
  // individual PUT response's own list, since each one only reflects state
  // as of its own request, not necessarily after every other concurrent PUT
  // here has also landed.
  async _autoDivide() {
    const activeZones = this.zones.filter((z) => z.active).sort((a, b) => a.zoneId - b.zoneId);
    if (activeZones.length === 0) {
      this.error = 'No active zones to arrange.';
      return;
    }

    this.error = null;
    const rects = screenDivisionRects(activeZones.length);

    try {
      const results = await Promise.all(activeZones.map((zone, i) => (
        fetch('/api/zones', {
          method: 'PUT',
          body: JSON.stringify({ zoneId: zone.zoneId, uvs: rects[i] }),
        }).then((r) => r.json())
      )));
      if (results.some((r) => !r.succeeded)) {
        this.error = "Couldn't save the auto-arranged zones.";
      }
    } catch {
      this.error = "Couldn't reach the daemon.";
    }

    try {
      const result = await (await fetch('/api/zones')).json();
      this.zones = result.zones ?? this.zones;
    } catch {
      // Keep whatever this.zones already was -- the next load/render retries.
    }
  }

  async _onAutoDivideClick(button) {
    button.disabled = true;
    await this._autoDivide();
    this._render();
  }

  _zoneLabel(zone) {
    const names = this.channelLightNames?.[zone.zoneId];
    return names?.length ? `Zone ${zone.zoneId} (${names.join(', ')})` : `Zone ${zone.zoneId}`;
  }

  _render() {
    const body = this.container.querySelector('.zm-body');
    this.zoneCanvas?.destroy();
    this.zoneCanvas = null;

    if (this.zones === null) {
      body.innerHTML = `<p class="status-text status-text-error">⚠ ${escapeHtml(this.error ?? 'Something went wrong.')}</p>`;
      return;
    }

    if (!this.outputName) {
      body.innerHTML = `<p class="status-text">Zone mapping isn't available right now -- it needs an active output and Video mode.</p>`;
      return;
    }

    if (this.zones.length === 0) {
      body.innerHTML = `
        <p class="status-text">There are no zones available on this output yet.</p>
        <div class="zm-actions">
          <button type="button" class="btn btn-secondary" id="zm-refresh">Check again</button>
        </div>
      `;
      body.querySelector('#zm-refresh').addEventListener('click', () => this._load());
      return;
    }

    const errorHtml = this.error ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.error)}</p>` : '';

    // onboarding matches Dashboard's own Zone Mapping arrangement -- Auto-
    // arrange centered above the canvas, Zone/Active/Gamma bundled into the
    // canvas's own row (renderActive below) -- rather than this screen's
    // non-onboarding layout (entertainment picker, canvas, then a separate
    // always-visible full zone list, Auto-arrange+Save together at bottom).
    body.innerHTML = this.onboarding ? `
      <div class="zm-canvas-actions">
        <button type="button" class="btn btn-secondary" id="zm-auto-divide">Auto-arrange zones</button>
      </div>
      <div id="zm-canvas-slot"></div>
      ${errorHtml}
      <div class="zm-actions">
        <button type="button" class="btn btn-primary" id="zm-save">Save</button>
      </div>
    ` : `
      <div id="zm-entertainment-slot"></div>
      <div id="zm-canvas-slot"></div>
      <div class="field zm-active-field">
        <label class="field-label">Active zones</label>
        <div id="zm-active-row"></div>
      </div>
      ${errorHtml}
      <div class="zm-actions">
        <button type="button" class="btn btn-secondary" id="zm-auto-divide">Auto-arrange zones</button>
        <button type="button" class="btn btn-primary" id="zm-save">Save</button>
      </div>
    `;

    // load() already resolved/persisted a default selection silently for
    // onboarding -- no picker UI here means nothing needs to display it.
    if (!this.onboarding) {
      this.entertainmentConfigSelect.mount(body.querySelector('#zm-entertainment-slot'));
    }

    this.zoneCanvas = new ZoneCanvas(body.querySelector('#zm-canvas-slot'), {
      zones: this.zones,
      selectedZoneId: this.selectedZoneId,
      zoneLabel: (zone) => this._zoneLabel(zone),
      onSelect: (zoneId) => { this.selectedZoneId = zoneId; },
      onError: (message) => { this.error = message; this._render(); },
      renderActive: this.onboarding,
    });
    this.selectedZoneId = this.zoneCanvas.selectedZoneId;
    if (!this.onboarding) this._renderActiveSection();

    body.querySelector('#zm-auto-divide').addEventListener('click', (e) => this._onAutoDivideClick(e.currentTarget));
    body.querySelector('#zm-save').addEventListener('click', () => this.onComplete());
  }

  // Non-onboarding only -- onboarding's Active toggle is bundled into
  // ZoneCanvas's own row (renderActive: true above).
  _renderActiveSection() {
    const slot = this.container.querySelector('#zm-active-row');
    const onError = (message) => { this.error = message; this._render(); };
    new ZoneActiveToggleList(slot, { zones: this.zones, zoneLabel: (zone) => this._zoneLabel(zone), onError });
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
