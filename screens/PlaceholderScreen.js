// Temporary stand-in for a screen not built yet (Output Connect, Zone
// Mapping, Tuning/Settings -- build-order steps 10/12/13/15). Exists so
// Dashboard's nav rows have a real navigate() target now, proving the
// shell's back/forward navigation for real instead of a silent no-op or a
// dev-only shortcut until every real screen exists. Delete each usage as
// its real screen gets built.
import { renderTopBar } from '../topBar.js';
import { DashboardScreen } from './DashboardScreen.js';

const TITLES = {
  bridge: 'Bridge',
  zones: 'Zone mapping',
  tuning: 'Tuning',
};

export class PlaceholderScreen {
  constructor(app, name) {
    this.app = app;
    this.name = name;
  }

  mount(container) {
    container.innerHTML = `
      <div class="top-bar-slot"></div>
      <p class="placeholder-body">This screen isn't built yet.</p>
    `;
    renderTopBar(container.querySelector('.top-bar-slot'), {
      title: TITLES[this.name] ?? this.name,
      showBack: true,
      onBack: () => this.app.navigate(new DashboardScreen(this.app)),
      onSettings: () => this.app.openSettings(),
    });
  }

  unmount() {}
}
