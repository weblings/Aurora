// Bare Dashboard shell: nav rows only -- no quick mode toggle or Stop yet,
// those need step 17 (the Dashboard's own segmented toggle + Stop button)
// built on top of this shell. See Analysis/WebUIAnalysis.md's build-order
// step 9. Built early and mostly empty on purpose: gives every screen built
// after this a real place to be linked into and reached, rather than only
// reachable via a dev shortcut until the whole flow is done. Every row now
// navigates to its real screen (steps 10, 12, 13, 15); PlaceholderScreen has
// no remaining callers.
import { renderTopBar } from '../topBar.js';
import { OutputConnectScreen } from './OutputConnectScreen.js';
import { ModeDeviceScreen } from './ModeDeviceScreen.js';
import { TuningScreen } from './TuningScreen.js';
import { ZoneMappingScreen } from './ZoneMappingScreen.js';

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
        <button type="button" class="nav-row" data-nav="capture-source">
          <span class="nav-row-label">Capture source — …</span>
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

    container.querySelector('[data-nav="capture-source"]').addEventListener('click', () => {
      this.app.navigate(new ModeDeviceScreen(this.app, {
        onComplete: () => this.app.navigate(new DashboardScreen(this.app)),
      }));
    });
    container.querySelector('[data-nav="zones"]').addEventListener('click', () => {
      this.app.navigate(new ZoneMappingScreen(this.app, {
        onComplete: () => this.app.navigate(new DashboardScreen(this.app)),
      }));
    });
    container.querySelector('[data-nav="tuning"]').addEventListener('click', () => {
      this.app.navigate(new TuningScreen(this.app, {
        onComplete: () => this.app.navigate(new DashboardScreen(this.app)),
      }));
    });

    await this._loadStatus(container);
  }

  unmount() {}

  // Capability-probe + persisted-state check -- this step's own "wired to
  // the capability-probe/persisted-state routing logic," using the real
  // endpoints that already exist. The Bridge row's click target itself
  // depends on this check too: it's disabled outright when this build has
  // no Hue output at all, real (OutputConnectScreen) otherwise. Capture
  // source and Zones have no compiled-in gate to check (a "dummy" video
  // input always exists, and the Zones row is always reachable -- the
  // screen itself shows an honest empty/unavailable state), only a status
  // label to fill in from /api/config and /api/zones respectively.
  async _loadStatus(container) {
    const bridgeRow = container.querySelector('[data-nav="bridge"]');
    const bridgeLabel = bridgeRow.querySelector('.nav-row-label');
    const captureLabel = container.querySelector('[data-nav="capture-source"] .nav-row-label');
    const zonesLabel = container.querySelector('[data-nav="zones"] .nav-row-label');

    let capabilities;
    try {
      capabilities = await (await fetch('/api/capabilities')).json();
    } catch {
      bridgeLabel.textContent = 'Bridge — Status unavailable';
      bridgeRow.disabled = true;
      captureLabel.textContent = 'Capture source — Status unavailable';
      zonesLabel.textContent = 'Zones — Status unavailable';
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

    try {
      const config = await (await fetch('/api/config')).json();
      const isAudio = !config.activeInputName && !!config.activeAudioInputName;
      captureLabel.textContent = `Capture source — ${isAudio ? 'Audio' : 'Video'}`;
    } catch {
      captureLabel.textContent = 'Capture source — Status unavailable';
    }

    try {
      const zonesResult = await (await fetch('/api/zones')).json();
      if (!zonesResult.outputName) {
        zonesLabel.textContent = 'Zones — Not available in Audio mode';
      } else if (zonesResult.zones.length === 0) {
        zonesLabel.textContent = 'Zones — None yet';
      } else {
        const activeCount = zonesResult.zones.filter((z) => z.active).length;
        zonesLabel.textContent = `Zones — ${activeCount} active`;
      }
    } catch {
      zonesLabel.textContent = 'Zones — Status unavailable';
    }
  }
}
