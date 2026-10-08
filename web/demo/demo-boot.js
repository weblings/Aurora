// Demo boot: installs the backend shim, then mounts the vendored Dashboard
// directly into the dashboard pane (Phase 2). No NUX: stock probeState is
// bypassed by construction, and the shim's configured:true keeps the
// bridge-setup navigation unreachable, so the app facade's navigate() only
// needs to exist, never to work.
//
// Phase 3: the shim owns zone state, seeded from ROOM_ZONE_MAP (the room
// rig's 4 quadrant zones; zonemap.js stays as the dormant flat rigs' data).
// Zone PUTs land
// in the shim and come back through onZonesChanged, which re-invokes the
// scene's existing buildLights() rebuild path -- light positions follow zone
// edits with no new scene code.
import { installDemoShim } from './demo-shim.js';
import { setDemoStore } from './demo-state.js';
import { ROOM_ZONE_MAP, rebuildZoneLights, applyLiveTuning } from './main.js';
import { DashboardScreen } from './vendor/webui/screens/DashboardScreen.js';
import { ZoneActiveToggleList } from './vendor/webui/ZoneActiveToggle.js';
import { DAEMON_UNREACHABLE } from './vendor/webui/messages.js';
import { ensureTooltips } from './vendor/webui/Tooltips.js';

// Phase 5: tooltip copy ships as a generated static fixture (see
// vendor/webui/gen-descriptors.py), loaded before mount so ensureTooltips
// below resolves real text. Failure falls back to [] -- Tooltips degrades
// silently, exactly as against an old binary without the endpoint.
let descriptorEntries = [];
try {
  const loaded = await (await fetch('./vendor/webui/descriptors.json')).json();
  if (Array.isArray(loaded?.descriptors)) descriptorEntries = loaded.descriptors;
} catch {
  descriptorEntries = [];
}

const { store } = installDemoShim({
  seed: {
    // Room rig truth: 4 quadrant zones (not the flat rigs' 8-zone zonemap),
    // so the Dashboard lists exactly the lights the scene drives.
    zones: ROOM_ZONE_MAP.map((z) => ({ everConfigured: true, ...z })),
    descriptors: descriptorEntries,
  },
  hooks: {
    onZonesChanged: () => rebuildZoneLights(),
    // Phase 4: every Dashboard tuning/mode PUT lands on the running scene.
    onConfigPatch: (applied, config) => applyLiveTuning(config),
  },
});
setDemoStore(store);
// Seed parity: the scene's static initializers match these defaults, but the
// single source of truth is the shim -- apply once so later PUTs only ever
// move values forward from here.
applyLiveTuning(store.getConfig());

// Fire-and-forget, app.js parity: /api/descriptors 404s until the Phase 5
// static tables land, and Tooltips degrades to {} on failure.
ensureTooltips();

// Demo Dashboard (Aurora-ifkn.3, wiring upstreamed in Aurora-ifkn.5): the
// vendored screen stays byte-identical to web/ui and now wires the
// toggle-sync natively (canvas flip re-renders the Bridge list, Bridge flip
// re-syncs the canvas bool over the same shared zone objects -- repaint-only,
// never data flow). This subclass re-attach is redundant but harmless (same
// wiring twice) until Aurora-ifkn.7 removes it.
//
// Pause stays visible: the shim answers PUT /api/state, so it works.
// Stop hides itself on the shim's canStop: false (no daemon to stop).
class DemoDashboardScreen extends DashboardScreen {
  _renderZoneMappingContent() {
    super._renderZoneMappingContent();
    if (this.zoneCanvas) {
      this.zoneCanvas.onActiveChange = () => this._renderBridgeZoneList();
    }
  }

  // Mirrors DashboardScreen._renderBridgeZoneList plus the list->canvas
  // onChange (kept in sync by hand until Aurora-ifkn.7 re-vendors).
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
      onChange: () => this.zoneCanvas?.refreshActive(),
    });
  }
}

const appFacade = {
  navigate() {},
  // The shim always answers: an unreachable signal never fires, so every
  // immediate re-check reads as reachable (Aurora-ifkn.3).
  async checkNow() { return true; },
};

const screen = new DemoDashboardScreen(appFacade);
await screen.mount(document.getElementById('screen-container'));
// Demo scope: no capture devices exist on a static page (the monitor and
// sink keys are ledgered no-ops), so the top tier is hidden outright via
// demo-layout.css -- no inert/dimmed state needed.
