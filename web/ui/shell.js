import { renderReloadError, parseMacPermissionError, renderAudioPermissionBanner } from './MacPermissionRecovery.js';

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
//
// System-error banner (Aurora-cj11): the beat polls GET /api/state instead
// of /api/capabilities -- one request gives reachability, host state and
// the error list, and gives an open Dashboard live paused-state updates for
// free (onStateUpdate below). The banner is shell-owned, same as the
// takeover: mounted next to #screen-container, fed only while the daemon
// answers (a stale error is worse than none, so the takeover clears it).
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_ABORT_TIMEOUT_MS = 2500;
const DEFAULT_FAILURE_THRESHOLD = 2;

async function defaultFetchStatus(signal) {
  const response = await fetch('/api/state', { signal });
  // Any HTTP answer -- whatever its status -- means the daemon is up. The
  // body read itself must not throw the verdict away: a 500 with no JSON
  // body is still a live daemon.
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Ignore body-read failures; the status line already answered.
  }
  return { reachable: true, ...(body && typeof body === 'object' ? body : {}) };
}

// Row prefix per error source, so the raw server reason reads as a sentence
// ("Couldn't start: <reason>"). Unknown sources show the message bare.
const SOURCE_PREFIX = {
  startup: "Couldn't start: ",
  resume: "Couldn't resume: ",
  reload: "Couldn't apply settings: ",
};

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
    this.bannerSlot = document.getElementById('shell-banner-slot');
    // onRecovered(preservedRouteId): re-probe and navigate back after the
    // daemon comes back. Set by app.js (bootstrap/recover); null in unit
    // tests that only assert the takeover itself.
    this.onRecovered = null;
    // onStateUpdate({state, errors, paused, uses*Input, samplesZones}): called after every reachable
    // poll with GET /api/state's own fields. Set by whichever screen cares
    // (Dashboard, so a tray pause/resume updates its top bar live); null
    // elsewhere, same single-slot shape as onRecovered.
    this.onStateUpdate = null;
    this.connectionState = 'live'; // live | down | stopped
    this.preservedRouteId = null;
    // Mac-permission detection inside a banner row needs the platform GET
    // /api/state doesn't carry; set once capabilities has been fetched
    // anywhere (app.js's probeState, DashboardScreen's _loadAll). Empty
    // until then, which just means a Mac permission row renders generic
    // (Retry, not Open Settings) for the few seconds before that happens.
    this.platform = '';
    this._fetchStatus = fetchStatus;
    this._pollIntervalMs = pollIntervalMs;
    this._abortTimeoutMs = abortTimeoutMs;
    this._failureThreshold = failureThreshold;
    this._beatTimer = null;
    this._inFlight = null;
    this._consecutiveFailures = 0;
    this._takeover = null; // null | 'unreachable' | 'stopped'
    this.hostState = null; // idle | running | paused | failed, from the last reachable poll
    this.hostErrors = []; // [{source, message}], from the last reachable poll
    this._bannerExpanded = false;
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
      const result = await this._fetchStatus(controller.signal);
      return this._handleReachable(result);
    } catch {
      return this._handleUnreachable();
    } finally {
      clearTimeout(timer);
    }
  }

  _handleReachable(result) {
    this._consecutiveFailures = 0;
    if (this.connectionState === 'down' || this.connectionState === 'stopped') {
      this.connectionState = 'live';
      const preserved = this.preservedRouteId;
      this.preservedRouteId = null;
      this._clearTakeover();
      if (this.onRecovered) this.onRecovered(preserved);
    }
    this._updateHostState(result);
    return true;
  }

  // Applies GET /api/state's fields from a reachable poll: feeds the
  // banner and tells an open Dashboard the live paused word, same request
  // the beat already made (Aurora-cj11). A test double's fetchStatus that
  // only returns {reachable:true} (no state/errors) reads as "nothing to
  // show", same as a malformed body -- never throws.
  _updateHostState(result) {
    const state = typeof result?.state === 'string' ? result.state : null;
    const errors = Array.isArray(result?.errors) ? result.errors : [];
    const paused = typeof result?.paused === 'boolean' ? result.paused : null;
    const flags = { usesVideoInput: result?.usesVideoInput, usesAudioInput: result?.usesAudioInput, samplesZones: result?.samplesZones };
    this.hostState = state;
    this.hostErrors = errors;
    this._renderBanner();
    if (this.onStateUpdate) this.onStateUpdate({ state, errors, paused, ...flags });
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
    // Every banner row is server state that's stale the moment the daemon
    // is gone; the takeover replaces it entirely rather than sitting next
    // to it (ErrorOverlay.md, 'Daemon unreachable as a banner row' under
    // Rejected alternatives). Fresh errors repopulate it on recovery, via
    // the same poll that clears this takeover.
    if (this.bannerSlot) this.bannerSlot.innerHTML = '';
    this.hostState = null;
    this.hostErrors = [];
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

  // One generic row per currently-true error source, never per-source
  // markup (ErrorOverlay.md, 'The banner'). Two or more collapse to a
  // summary line the user expands; a single error always shows in full.
  // Onboarding gate: a 'reload' source is the mid-onboarding "no outputs
  // paired" build failure (Aurora-d3ec's step-3 note) -- real only once
  // onboarding has actually reached the point of pairing an output, which
  // in the fixed NUX order (connect -> select -> Mode+Device) always
  // precedes Mode+Device for any output this build knows how to onboard.
  // So "before the pairing step" and "anywhere before the Dashboard route"
  // are the same condition for every real flow; gating on the route id
  // needs no extra state threaded in from app.js's own onboarding walk.
  _visibleErrors() {
    const suppressReload = this.currentRouteId !== 'dashboard';
    return this.hostErrors.filter((error) => !(suppressReload && error.source === 'reload'));
  }

  _renderBanner() {
    if (!this.bannerSlot) return;
    const errors = this._visibleErrors();
    if (errors.length === 0) {
      this.bannerSlot.innerHTML = '';
      this._bannerExpanded = false;
      return;
    }

    const collapsed = errors.length > 1 && !this._bannerExpanded;
    const body = collapsed
      ? `<button type="button" class="shell-banner-summary" id="shell-banner-expand">⚠ ${errors.length} problems ▾</button>`
      : errors.map((error) => this._renderBannerRow(error)).join('');

    this.bannerSlot.innerHTML = `
      <div class="shell-banner">
        <div class="shell-banner-inner">${body}</div>
      </div>
    `;

    if (collapsed) {
      this.bannerSlot.querySelector('#shell-banner-expand')?.addEventListener('click', () => {
        this._bannerExpanded = true;
        this._renderBanner();
      });
      return;
    }
    for (const error of errors) {
      this.bannerSlot.querySelector(`#shell-banner-retry-${error.source}`)?.addEventListener('click', () => this._retry(error.source));
      this.bannerSlot.querySelector(`#shell-banner-dismiss-${error.source}`)?.addEventListener('click', () => this._dismiss(error));
    }
  }

  // Permission-prefixed errors reuse renderReloadError with Retry only (no
  // Open Settings link: it never adds Aurora to the Screen Recording list,
  // only macOS's own prompt does, and a retry applies the grant live);
  // everything else gets the generic row with a Retry button (ErrorOverlay.md, 'Resolve
  // action'). platform comes from wherever it's been set (see
  // constructor); unknown platform just means no Mac row is ever detected.
  _renderBannerRow(error) {
    const parsed = this.platform === 'mac' ? parseMacPermissionError(error.message) : null;
    const retryId = `shell-banner-retry-${escapeHtml(error.source)}`;
    // Saved-not-applied: a reload error on a running host (the old setup
    // still drives the lights). Never promises the next launch works, it
    // builds from the same saved config (ErrorOverlay.md, 'Banner and copy').
    const text = this.hostState === 'running' && error.source === 'reload'
      ? `Saved, but couldn't apply: ${error.message}. Aurora is still running your previous setup and will try the new one next time it starts.`
      : (SOURCE_PREFIX[error.source] ?? '') + error.message;
    // Daemon-pushed heuristic (Aurora-h457). Retry is the generic reload: it
    // rebuilds the grabber, which a grant alone does not revive.
    const inner = error.source === 'audio_permission'
      ? renderAudioPermissionBanner({ retryId })
      : parsed
      ? renderReloadError(error.message, this.platform, { retryId })
      : `<p class="status-text status-text-error">⚠ ${escapeHtml(text)}</p>
         <button type="button" class="btn btn-secondary" id="${retryId}" style="margin-top: var(--aurora-space-3);">Retry</button>`;
    // X only while the old setup still works (ErrorOverlay.md, 'Dismiss'):
    // a paused or failed host's row is the reason there are no lights.
    const dismiss = this.hostState === 'running' && Number.isInteger(error.id)
      ? `<button type="button" class="shell-banner-dismiss" id="shell-banner-dismiss-${escapeHtml(error.source)}" aria-label="Dismiss">×</button>`
      : '';
    return `<div class="shell-banner-row">${dismiss}${inner}</div>`;
  }

  // The daemon owns the dismissal; the {source, id} pair makes a click that
  // races a newer failure a no-op there. No optimistic clearing: checkNow()
  // redraws from what the daemon holds, a stale id included.
  async _dismiss(error) {
    try {
      await fetch('/api/state/dismiss', {
        method: 'POST',
        body: JSON.stringify({ source: error.source, id: error.id }),
      });
    } catch {
      // Unreachable is the beat's takeover; checkNow() below reads it.
    }
    await this.checkNow();
  }

  // Failed host -> POST /api/reload (same route the banner's Retry always
  // meant, Aurora-d3ec step 4); failed resume -> PUT /api/state
  // {running:true}, the same retry _togglePause already sends. Either way,
  // an immediate re-check refreshes the banner from whatever actually
  // happened, success or another failure -- no optimistic clearing.
  async _retry(source) {
    const [url, options] = source === 'resume'
      ? ['/api/state', { method: 'PUT', body: JSON.stringify({ running: true }) }]
      : ['/api/reload', { method: 'POST' }];
    try {
      await fetch(url, options);
    } catch {
      // A network failure here is exactly what the beat's own unreachable
      // path is for; checkNow() below reads it the same way.
    }
    await this.checkNow();
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
