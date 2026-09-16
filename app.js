// Entry point loaded by index.html. Exposes one App singleton for screens to
// import and call navigate()/openSettings() on -- no screens exist yet
// (Analysis/WebUIAnalysis.md's build-order steps 9+), so this doesn't
// navigate anywhere on its own yet.
import { App } from './shell.js';

export const app = new App();
