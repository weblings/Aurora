// App shell: owns the one #screen-container mount point. Same navigate()
// pattern as RockyRoad's own App.ts, trimmed to what Aurora actually needs
// here -- no renderer, no song pause/resume/countdown, no per-instrument
// sections. See docs/WebUI/WebUI_Design_1stPass.md's build-order step 7.
// The Settings modal this once also owned was removed in pass 2's step 19 --
// its one job (bridge re-pairing) already lives on Dashboard's own Bridge
// row/OutputConnectScreen, and everything else folded into the accordion
// Dashboard's sections instead.
//
// A screen is any object shaped { mount(container), unmount() } -- mount()
// may be async (a screen fetching its own data before rendering), unmount()
// must not be.
export class App {
  constructor() {
    this.currentScreen = null;
    this.screenContainer = document.getElementById('screen-container');
  }

  navigate(screen) {
    this.currentScreen?.unmount();
    this.currentScreen = screen;
    screen.mount(this.screenContainer);
  }
}
