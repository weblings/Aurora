// Bare Dashboard shell: nav rows only (Bridge/Zones/Tuning) -- no mode toggle
// or Stop yet, those need steps 11/16's backend endpoints first. See
// Analysis/WebUIAnalysis.md's build-order step 9. Built early and mostly
// empty on purpose: gives every screen built after this a real place to be
// linked into and reached, rather than only reachable via a dev shortcut
// until the whole flow is done. Bridge now navigates to the real
// OutputConnectScreen (step 10); Zones/Tuning still use PlaceholderScreen
// until steps 12-15 build them.
import { renderTopBar } from '../topBar.js';
import { PlaceholderScreen } from './PlaceholderScreen.js';
import { OutputConnectScreen } from './OutputConnectScreen.js';

export class DashboardScreen {
  constructor(app) {
    this.app = app;
  }

  async mount(container) {
    container.innerHTML = `
      <div class="top-bar-slot"></div>
      <div class="nav-rows">
        <button type="button" class="nav-row" data-nav="bridge">
          <span class="nav-row-label">Bridge — …</span>
          <span class="nav-row-chevron" aria-hidden="true">&#8250;</span>
        </button>
        <button type="button" class="nav-row" data-nav="zones">
          <span class="nav-row-label">Zones — …</span>
          <span class="nav-row-chevron" aria-hidden="true">&#8250;</span>
        </button>
        <button type="button" class="nav-row" data-nav="tuning">
          <span class="nav-row-label">Tuning — Adjust</span>
          <span class="nav-row-chevron" aria-hidden="true">&#8250;</span>
        </button>
      </div>
    `;

    renderTopBar(container.querySelector('.top-bar-slot'), {
      title: 'Aurora',
      showBack: false,
      onSettings: () => this.app.openSettings(),
    });

    container.querySelector('[data-nav="zones"]').addEventListener('click', () => {
      this.app.navigate(new PlaceholderScreen(this.app, 'zones'));
    });
    container.querySelector('[data-nav="tuning"]').addEventListener('click', () => {
      this.app.navigate(new PlaceholderScreen(this.app, 'tuning'));
    });

    await this._loadStatus(container);
  }

  unmount() {}

  // Capability-probe + persisted-state check -- this step's own "wired to
  // the capability-probe/persisted-state routing logic," using the real
  // endpoints that already exist. The Bridge row's click target itself
  // depends on this check now too: it's disabled outright when this build
  // has no Hue output at all, real (OutputConnectScreen) otherwise. Zones
  // has no backing endpoint yet (ZoneMap REST is step 14), so it stays an
  // honest placeholder, not fabricated data.
  async _loadStatus(container) {
    const bridgeRow = container.querySelector('[data-nav="bridge"]');
    const bridgeLabel = bridgeRow.querySelector('.nav-row-label');

    let capabilities;
    try {
      capabilities = await (await fetch('/api/capabilities')).json();
    } catch {
      bridgeLabel.textContent = 'Bridge — Status unavailable';
      bridgeRow.disabled = true;
      container.querySelector('[data-nav="zones"] .nav-row-label').textContent = 'Zones — Not available yet';
      return;
    }

    if (!capabilities.outputs?.includes('hue')) {
      bridgeLabel.textContent = 'Bridge — not available in this build';
      bridgeRow.disabled = true;
    } else {
      bridgeRow.addEventListener('click', () => {
        this.app.navigate(new OutputConnectScreen(this.app, {
          onComplete: () => this.app.navigate(new DashboardScreen(this.app)),
        }));
      });

      try {
        const connection = await (await fetch('/api/hue/connection')).json();
        bridgeLabel.textContent = connection.configured ? 'Bridge — Connected' : 'Bridge — Not connected';
      } catch {
        bridgeLabel.textContent = 'Bridge — Status unavailable';
      }
    }

    container.querySelector('[data-nav="zones"] .nav-row-label').textContent = 'Zones — Not available yet';
  }
}
