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
//
// Connection watcher (Aurora-ewyz): the shell also owns the daemon
// heartbeat and the heading-only stopped takeover, so every screen -- Dashboard and
// every NUX step alike -- gets them with no per-screen wiring. Design:
// docs/planning/ErrorOverlay.md, 'Daemon unreachable: take over the
// screen'. The takeover reuses the .overlay scrim (forms.css:365).
// Single variant (Aurora-yzp4): the overlay is always just
// <h2>Aurora has stopped</h2> -- no body copy, no button. The page cannot
// relaunch the daemon, so the beat keeps polling in every state and clears
// the overlay through onRecovered when the daemon answers.
//
// Failure taxonomy (contract Aurora-cj11's Retry relies on): only a
// network error, an abort, or a timeout counts as unreachable. Any HTTP
// response -- including a 500 with a JSON body -- counts as reachable, so
// a failed Retry never reads as a dead daemon.
//
// A single blip never raises the takeover: it takes `failureThreshold`
// consecutive failed polls. A failure that only means unreachable sets no
// inline error anywhere -- the takeover owns it; inline catches just poke
// checkNow() (see below) and stay silent unless the daemon answers.
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_ABORT_TIMEOUT_MS = 2500;
const DEFAULT_FAILURE_THRESHOLD = 2;

async function defaultFetchStatus(signal) {
  const response = await fetch('/api/capabilities', { signal });
  // Any HTTP answer -- whatever its status -- means the daemon is up. The
  // body read itself must not throw the verdict away: a 500 with no JSON
  // body is still a live daemon.
  try {
    await response.json();
  } catch {
    // Ignore body-read failures; the status line already answered.
  }
  return { reachable: true };
}

export class App {
  constructor({
    fetchStatus = defaultFetchStatus,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    abortTimeoutMs = DEFAULT_ABORT_TIMEOUT_MS,
    failureThreshold = DEFAULT_FAILURE_THRESHOLD,
  } = {}) {
    this.currentScreen = null;
    this.currentRouteId = null;
    this.screenContainer = document.getElementById('screen-container');
    this.overlaySlot = document.getElementById('shell-overlay-slot');
    // onRecovered(preservedRouteId): re-probe and navigate back after the
    // daemon comes back. Set by app.js (bootstrap/recover); null in unit
    // tests that only assert the takeover itself.
    this.onRecovered = null;
    this.connectionState = 'live'; // live | down | stopped
    this.preservedRouteId = null;
    this._fetchStatus = fetchStatus;
    this._pollIntervalMs = pollIntervalMs;
    this._abortTimeoutMs = abortTimeoutMs;
    this._failureThreshold = failureThreshold;
    this._beatTimer = null;
    this._inFlight = null;
    this._consecutiveFailures = 0;
    this._takeover = null; // null | 'unreachable' | 'stopped'
  }

  navigate(screen, routeId = null) {
    this.currentScreen?.unmount();
    this.currentScreen = screen;
    if (routeId !== null) this.currentRouteId = routeId;
    screen.mount(this.screenContainer);
  }

  // Recursive setTimeout (never setInterval) so a hung poll cannot stack
  // overlapping beats; the abort sits inside the cadence for the same
  // reason. Runs for the app's lifetime, across every screen.
  startHeartbeat() {
    this.stopHeartbeat();
    const beat = async () => {
      if (this._beatTimer === null) return;
      await this._pollOnce();
      if (this._beatTimer === null) return;
      this._beatTimer = setTimeout(beat, this._pollIntervalMs);
    };
    this._beatTimer = setTimeout(beat, this._pollIntervalMs);
  }

  stopHeartbeat() {
    if (this._beatTimer !== null) {
      clearTimeout(this._beatTimer);
      this._beatTimer = null;
    }
  }

  // Immediate re-check for inline catches: they own no error text, but a
  // failure there is the earliest hint the daemon may be gone. Concurrent
  // triggers share the one in-flight poll, so N simultaneous triggers cost
  // one request. Resolves true
  // when the daemon answered, false otherwise -- never rejects, so a
  // catch can `await` it to tell a one-request blip (daemon answered:
  // report the failed action inline) from a real outage (takeover owns
  // it). See docs/lessons/components.md:308.
  async checkNow() {
    // Always a fresh poll (or an attach to the one already running): a
    // cached verdict could predate the very failure that triggered this
    // call. Cost is bounded anyway -- concurrent triggers share one poll
    // via _pollOnce, and a hung poll aborts on its own timer.
    try {
      return await this._pollOnce();
    } catch {
      return false;
    }
  }

  // A confirmed Stop (Dashboard's Stop button): the daemon is exiting on
  // purpose, so the takeover shows the intentional copy -- but the beat
  // keeps polling, so relaunching Aurora clears it with no click
  // (Aurora-yzp4). A tray/quit Stop sends no signal and lands in the same
  // overlay through the beat instead.
  notifyStopConfirmed() {
    this.connectionState = 'stopped';
    this.preservedRouteId = this.currentRouteId;
    this._showTakeover('stopped');
    this.startHeartbeat();
  }

  // Boot and stage-transition failure path (was renderUnreachable): show
  // the takeover and make sure the beat is watching for recovery.
  showUnreachable() {
    this.preservedRouteId = this.currentRouteId;
    this._showTakeover('unreachable');
    this.startHeartbeat();
  }

  // Single-flight: the beat and any number of checkNow() triggers share
  // one poll, so overlapping requests are impossible by construction.
  async _pollOnce() {
    if (this._inFlight) return await this._inFlight;
    this._inFlight = this._runPoll();
    try {
      return await this._inFlight;
    } finally {
      this._inFlight = null;
    }
  }

  async _runPoll() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._abortTimeoutMs);
    try {
      await this._fetchStatus(controller.signal);
      return this._handleReachable();
    } catch {
      return this._handleUnreachable();
    } finally {
      clearTimeout(timer);
    }
  }

  _handleReachable() {
    this._consecutiveFailures = 0;
    if (this.connectionState === 'down' || this.connectionState === 'stopped') {
      this.connectionState = 'live';
      const preserved = this.preservedRouteId;
      this.preservedRouteId = null;
      this._clearTakeover();
      if (this.onRecovered) this.onRecovered(preserved);
    }
    return true;
  }

  _handleUnreachable() {
    if (this.connectionState === 'stopped') return false;
    this._consecutiveFailures += 1;
    if (this._consecutiveFailures >= this._failureThreshold && this.connectionState === 'live') {
      this.connectionState = 'down';
      this.preservedRouteId = this.currentRouteId;
      this._showTakeover('unreachable');
    }
    return false;
  }

  // Single variant (Aurora-yzp4): heading only, never body copy or a
  // button -- the page cannot relaunch the daemon, and the beat owns
  // recovery. `kind` is kept so the two call sites read unchanged; both
  // render the same overlay, which is also what forms.css's `h2:last-child`
  // rule assumes.
  _showTakeover(kind) {
    if (!this.overlaySlot) return;
    this._takeover = kind;
    this.overlaySlot.innerHTML = `
      <div class="overlay">
        <div class="overlay-scrim"></div>
        <div class="overlay-panel">
          <h2>Aurora has stopped</h2>
        </div>
      </div>
    `;
  }

  _clearTakeover() {
    this._takeover = null;
    if (this.overlaySlot) this.overlaySlot.innerHTML = '';
  }
}
