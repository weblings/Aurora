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
import {
  ROOM_ZONE_MAP, rebuildZoneLights, applyLiveTuning, setPaused,
  engine, attachRoomExtras, startRoomTest, endRoomTest,
} from './main.js';
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

const { store, route, streams, roomExtras } = installDemoShim({
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
    // Pause (Aurora-calt): the scene freezes the lamps, as real bulbs hold their last color.
    onPausedChanged: (paused) => setPaused(paused),
    // The editor's routes call the room's engine and change what the room runs (Aurora-51nv.10).
    engine: engine.client,
    engineReady: engine.ready,
    onActiveGraphChanged: () => applyLiveTuning(store.getConfig()),
    onTestGraph: (doc, inputs) => startRoomTest(doc, inputs),
    onTestEnd: () => endRoomTest(),
  },
});
setDemoStore(store);
// The editor iframe is same origin and reaches the shim through this one handle
// (demo-editor-frame.js).
window.auroraDemo = { route, streams };
attachRoomExtras(roomExtras);
// Seed parity: the scene's static initializers match these defaults, but the
// single source of truth is the shim -- apply once so later PUTs only ever
// move values forward from here.
applyLiveTuning(store.getConfig());

// Fire-and-forget, app.js parity: /api/descriptors 404s until the Phase 5
// static tables land, and Tooltips degrades to {} on failure.
ensureTooltips();

// Demo Dashboard: the vendored screen is byte-identical to web/ui
// (Aurora-ifkn.7) and wires everything natively, so the demo mounts it
// directly -- no subclass.
//
// Pause stays visible: the shim answers PUT /api/state and onPausedChanged
// freezes the scene's lamps on their last color (Aurora-calt).
// Stop hides itself on the shim's canStop: false (no daemon to stop).
const pane = document.getElementById('dashboard-pane');
const container = document.getElementById('screen-container');
let screen = null;
let editorFrame = null;

async function mountDashboard() {
  screen = new DashboardScreen(appFacade);
  await screen.mount(container);
}

// The editor takes the Dashboard pane next to the room, so the room keeps running.
function openEditor(href) {
  if (editorFrame) return;
  screen?.unmount();
  screen = null;
  container.hidden = true;
  pane.classList.add('editing');
  editorFrame = document.createElement('iframe');
  editorFrame.className = 'editor-frame';
  editorFrame.title = 'Graph editor';
  editorFrame.src = href;
  pane.append(editorFrame);
}

// The editor's back link calls this. A fresh mount refetches the effect list.
window.auroraCloseEditor = async function auroraCloseEditor() {
  if (!editorFrame) return;
  editorFrame.remove();
  editorFrame = null;
  pane.classList.remove('editing');
  container.hidden = false;
  await mountDashboard();
};

const appFacade = {
  navigate() {},
  openEditor,
  // The visitor owns the demo, so the row menu offers Delete (the app gates it on Admin).
  canApprove: true,
  // The shim always answers: an unreachable signal never fires, so every
  // immediate re-check reads as reachable (Aurora-ifkn.3).
  async checkNow() { return true; },
};

await mountDashboard();
