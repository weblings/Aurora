// Entry point loaded by index.html. Screens receive the App instance via
// their own constructor (e.g. DashboardScreen(app), ModeDeviceScreen(app,
// { onComplete })) rather than importing a shared singleton -- same
// dependency-injection shape as RockyRoad's own IScreen classes, which
// avoids a circular import between this file and every screen module.
import { App } from './shell.js';
import { DashboardScreen } from './screens/DashboardScreen.js';

const app = new App();

// Always the Dashboard for now -- full first-run-vs-returning-user routing
// (Analysis/WebUIAnalysis.md's Navigation model) is build-order step 18,
// once screens 1-4 actually exist to route to.
app.navigate(new DashboardScreen(app));
