// Demo boot: installs the backend shim, then mounts the vendored Dashboard
// directly into the dashboard pane (Phase 2). No NUX: stock probeState is
// bypassed by construction, and the shim's configured:true keeps the
// bridge-setup navigation unreachable, so the app facade's navigate() only
// needs to exist, never to work.
//
// Phase 3: the shim owns zone state, seeded from zonemap.js (which stays the
// seed data + ZoneMapStore shape mirror, not the live copy). Zone PUTs land
// in the shim and come back through onZonesChanged, which re-invokes the
// scene's existing buildLights() rebuild path -- light positions follow zone
// edits with no new scene code.
import { installDemoShim } from './demo-shim.js';
import { setDemoStore } from './demo-state.js';
import { zoneMap } from './zonemap.js';
import { rebuildZoneLights } from './main.js';
import { DashboardScreen } from './vendor/webui/screens/DashboardScreen.js';
import { ensureTooltips } from './vendor/webui/Tooltips.js';

const { store } = installDemoShim({
  seed: {
    zones: zoneMap.map((z) => ({ everConfigured: true, ...z })),
  },
  hooks: {
    onZonesChanged: () => rebuildZoneLights(),
  },
});
setDemoStore(store);

// Fire-and-forget, app.js parity: /api/descriptors 404s until the Phase 5
// static tables land, and Tooltips degrades to {} on failure.
ensureTooltips();

const appFacade = {
  navigate() {},
};

const screen = new DashboardScreen(appFacade);
screen.mount(document.getElementById('screen-container'));
