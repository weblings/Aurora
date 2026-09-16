// Temporary stand-in for a screen not built yet (Zone Mapping -- build-order
// steps 14/15). Output Connect, Mode+Device Select, and Tuning/Settings all
// have real screens now (steps 10, 12, 13) and no longer route through here.
// Exists so Dashboard's nav rows have a real navigate() target, proving the
// shell's back/forward navigation for real instead of a silent no-op or a
// dev-only shortcut until every real screen exists. Delete this file's last
// usage once Zone Mapping is built.
import { renderTopBar } from '../topBar.js';
import { DashboardScreen } from './DashboardScreen.js';

const TITLES = {
  zones: 'Zone mapping',
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
