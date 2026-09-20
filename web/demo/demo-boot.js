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

const appFacade = {
  navigate() {},
};

const screen = new DashboardScreen(appFacade);
await screen.mount(document.getElementById('screen-container'));
// Demo scope: no capture devices exist on a static page (the monitor and
// sink keys are ledgered no-ops), so the device field is inert + dimmed
// instead of interactive. `inert` blocks mouse, touch, keyboard, and
// assistive-tech interaction alike -- no per-control work needed.
document.querySelector('#dashboard-pane .db-device-slot')?.setAttribute('inert', '');
