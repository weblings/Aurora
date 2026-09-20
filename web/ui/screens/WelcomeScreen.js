// Welcome: the true first screen of the boot chain, shown only from
// bootstrap()'s needsOutputConnect branch (see app.js) -- never from
// Dashboard's "Change bridge" or any other re-entry into OutputConnectScreen,
// since those aren't first-time setup and this screen's copy would be a
// tone mismatch there. Starts Hue bridge discovery immediately on mount and
// hands the in-flight promise to whatever comes next via onComplete, so the
// time the user spends reading this screen doubles as the discovery screen's
// own wait time instead of a separate spinner later.
import { renderTopBar } from '../topBar.js';
import { renderNavFooter } from '../NavFooter.js';

export class WelcomeScreen {
  constructor(app, { onComplete }) {
    this.app = app;
    this.onComplete = onComplete;
    this.discoveryPromise = fetch('/api/hue/discover').then((r) => r.json());
  }

  async mount(container) {
    this.container = container;
    container.innerHTML = `
      <div class="top-bar-slot"></div>
      <div class="welcome-body text-pair">
        <p class="text-primary">Welcome to Aurora</p>
        <p class="text-secondary">Let's get you setup</p>
      </div>
      <div class="nav-footer-slot"></div>
    `;
    renderTopBar(container.querySelector('.top-bar-slot'), {
      title: 'Setup',
      showBack: false,
    });
    renderNavFooter(container.querySelector('.nav-footer-slot'), {
      showBack: false,
      onContinue: () => this.onComplete(this.discoveryPromise),
    });
  }

  unmount() {}
}
