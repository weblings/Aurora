// Demo boot: installs the backend shim, then mounts the vendored Dashboard
// directly into the dashboard pane (Phase 2). No NUX: stock probeState is
// bypassed by construction, and the shim's configured:true keeps the
// bridge-setup navigation unreachable, so the app facade's navigate() only
// needs to exist, never to work.
import { installDemoShim } from './demo-shim.js';
import { DashboardScreen } from './vendor/webui/screens/DashboardScreen.js';
import { ensureTooltips } from './vendor/webui/Tooltips.js';

installDemoShim();
// Fire-and-forget, app.js parity: /api/descriptors 404s until the Phase 5
// static tables land, and Tooltips degrades to {} on failure.
ensureTooltips();

const appFacade = {
  navigate() {},
};

const screen = new DashboardScreen(appFacade);
screen.mount(document.getElementById('screen-container'));
