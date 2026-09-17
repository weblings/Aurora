// App shell: owns the one #screen-container mount point and the persistent
// settings modal (open/close/scrim). Same navigate()/settings pattern as
// RockyRoad's own App.ts, trimmed to what Aurora actually needs here -- no
// renderer, no song pause/resume/countdown, no per-instrument sections.
// See Analysis/WebUI/WebUI_Design_1stPass.md's build-order step 7.
//
// A screen is any object shaped { mount(container), unmount() } -- mount()
// may be async (a screen fetching its own data before rendering), unmount()
// must not be.
export class App {
  constructor() {
    this.currentScreen = null;
    this.screenContainer = document.getElementById('screen-container');
    this.settingsOverlay = document.getElementById('settings-overlay');
    this.settingsBody = document.getElementById('settings-body');

    document.getElementById('settings-scrim').addEventListener('click', () => this.closeSettings());
    document.getElementById('settings-close').addEventListener('click', () => this.closeSettings());
  }

  navigate(screen) {
    this.currentScreen?.unmount();
    this.currentScreen = screen;
    screen.mount(this.screenContainer);
  }

  openSettings() {
    this.settingsOverlay.classList.remove('hidden');
  }

  closeSettings() {
    this.settingsOverlay.classList.add('hidden');
  }
}
