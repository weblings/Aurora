// Mac-only NUX tip: shown between Welcome and Output Connect (see app.js's
// needsOutputConnect branch), never on Windows/Linux and never after NUX has
// completed. Replaces the abandoned first-run notification (Aurora-qps.5),
// which needed a notarized build and a permission dialog and fired only once.
// Takes no discovery of its own: the in-flight Hue discovery promise from
// Welcome is only carried through to onComplete, so discovery keeps running
// while the user reads this.
import { renderTopBar } from '../topBar.js';
import { renderNavFooter } from '../NavFooter.js';
// Tip GIF resolved against this module (screens/ -> ../icons).
const MAC_TRAY_GIF_URL = new URL('../icons/MacTray.gif', import.meta.url).href;

export class MacTrayTipScreen {
  constructor(app, { discoveryPromise, onBack, onComplete }) {
    this.app = app;
    this.discoveryPromise = discoveryPromise;
    this.onBack = onBack;
    this.onComplete = onComplete;
  }

  async mount(container) {
    this.container = container;
    container.innerHTML = `
      <div class="top-bar-slot"></div>
      <div class="mac-tray-tip-body">
        <img src="${MAC_TRAY_GIF_URL}" alt="The Aurora icon in the macOS menu bar, opening a menu with Launch UI and Stop" class="mac-tray-tip-gif" />
        <div class="text-pair">
          <p class="text-primary">Aurora lives in your menu bar</p>
          <p class="text-secondary">Click the Aurora icon for Launch UI, Pause / Resume, or Stop.</p>
        </div>
      </div>
      <div class="nav-footer-slot"></div>
    `;
    renderTopBar(container.querySelector('.top-bar-slot'), {
      title: 'Menu Bar',
      showBack: false,
    });
    renderNavFooter(container.querySelector('.nav-footer-slot'), {
      onBack: this.onBack,
      onContinue: () => this.onComplete(this.discoveryPromise),
    });
  }

  unmount() {}
}
