import { arrivalAnnouncement, arrivedKeys, baselineReady, baselineSnapshot, bannerHtml, bannerRows, clockText, collapsibleKeys, orderRows, reconcileSnapshot } from './shellRows.js';
import { applyPatch } from './shellPatch.js';
import { decidePairing, fetchPendingPairings } from './Pairing.js';
import { createShellCap } from './shellCap.js';

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
// The arrival pulse is 1375 ms (styles/shell.css); shellCap.js clears data-new if animationend never
// comes (an animation turned off, a hidden tab), from the moment the pulse starts. These are the
// announcement's two timers (shellRows.js arrivals).
const ANNOUNCE_DELAY_MS = 50;
const ANNOUNCE_CLEAR_MS = 10_000;
const DEFAULT_FAILURE_THRESHOLD = 2;
// Routes where a 'reload' error is real (an output is paired); see
// _visibleErrors. Capture Source is one: a denied capture permission lands here.
const RELOAD_ERROR_ROUTES = new Set(['mode-device', 'zone-mapping', 'dashboard']);

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

// Pending LAN pairing requests (Aurora-5ipy.6), polled with the beat only
// while this browser can approve them (loopback or a paired admin).
const defaultFetchPending = () => fetchPendingPairings();

export class App {
  constructor({
    fetchStatus = defaultFetchStatus,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    abortTimeoutMs = DEFAULT_ABORT_TIMEOUT_MS,
    failureThreshold = DEFAULT_FAILURE_THRESHOLD,
    fetchPending = defaultFetchPending,
  } = {}) {
    this.currentScreen = null;
    this.currentRouteId = null;
    this.screenContainer = document.getElementById('screen-container');
    this.overlaySlot = document.getElementById('shell-overlay-slot');
    this.bannerSlot = document.getElementById('shell-banner-slot');
    // One delegated click handler for every button in the banner: data-action and data-key name
    // what was pressed (shellRows.js), _act does it. The patch keeps the buttons alive across polls.
    this._rows = []; // the rows last drawn, laid out
    // Arrivals (Aurora-9hqa.2): every row key the last render held (null until the baseline), the one
    // polite live region (#shell-announcer, outside the slot so the patch never touches it) and its timers.
    this._knownKeys = null;
    this.announcer = document.getElementById('shell-announcer');
    this._announceParts = [];
    this._announceTimer = null;
    this._announceClearTimer = null;
    // The 60vh cap on the rows region (Aurora-9hqa.3): scroll to a new row, pulses start when seen.
    this._cap = createShellCap({ onPulseDone: (node) => node.removeAttribute('data-new') });
    this.bannerSlot?.addEventListener?.('animationend', (event) => {
      if (event.target?.hasAttribute?.('data-new')) event.target.removeAttribute('data-new');
    });
    this.bannerSlot?.addEventListener?.('click', (event) => {
      const button = event.target?.closest?.('[data-action]');
      if (button) void this._act(button.getAttribute('data-action'), button.getAttribute('data-key'));
    });
    // onRecovered(preservedRouteId): re-probe and navigate back after the
    // daemon comes back. Set by app.js (bootstrap/recover); null in unit
    // tests that only assert the takeover itself.
    this.onRecovered = null;
    // onStateUpdate({state, errors, paused, uses*Input, samplesZones, effect, mcpEffectId, testActive}): called after every reachable
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
    // Set by app.js from GET /api/pairing/status: true on loopback or a paired admin. app.js starts
    // it at null (not read yet), which holds the collapse baseline back (Aurora-9hqa.4); the default
    // here is false so a page with no status read has nothing to wait for.
    this.canApprove = false;
    this.pendingPairings = []; // [{ref, name, scope, code}]
    this._pendingLoaded = false; // the first pending-pairing result is in (a failed read counts, so the baseline cannot hang)
    // Fired after an approval, so an open Dashboard refreshes its device list.
    this.onPairedDevicesChanged = null;
    this._fetchStatus = fetchStatus;
    this._fetchPending = fetchPending;
    this._pollIntervalMs = pollIntervalMs;
    this._abortTimeoutMs = abortTimeoutMs;
    this._failureThreshold = failureThreshold;
    this._beatTimer = null;
    this._inFlight = null;
    this._consecutiveFailures = 0;
    this._takeover = null; // null | 'unreachable' | 'stopped'
    this.hostState = null; // idle | running | paused | failed, from the last reachable poll
    this.hostErrors = []; // [{source, message}], from the last reachable poll
    this.hostConditions = []; // [{source, message}], standing facts (Aurora-rbp3)
    // Collapse state (Aurora-u8jx.5): the row keys the user collapsed over, or null for open. Memory
    // only. The baseline (2+ rows collapsed, a lone row open) is taken once per page load and once per
    // recovery, when the first /api/state reply, the canApprove answer and (if it can approve) the
    // first pending-pairing result are all in (shellRows.js baselineReady). Nothing is drawn before.
    this._collapsed = null;
    this._stateReplied = false;
    this._baselined = false;
    this.lightTestLive = false; // a running light test with no deadline
    this.lightTestEndsAt = null; // ms epoch the running MCP light test must be confirmed by, else null
    this.lightTestHolder = null; // {session, client} of the running light test, from /api/state test.holder
    this._lightTestTimer = null;
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
    if (this.canApprove) void this._refreshPending();
    return true;
  }

  // A failed pending read keeps the last list; the beat retries next cadence.
  async _refreshPending() {
    try {
      this.pendingPairings = await this._fetchPending();
    } catch {
      // Keep the last list. The first read still counts for the baseline, so a broken route cannot
      // hold the whole shell back.
      this._pendingLoaded = true;
      this._maybeBaseline();
      this._renderBanner();
      return;
    }
    this._pendingLoaded = true;
    this._maybeBaseline();
    this._renderBanner();
  }

  // Applies GET /api/state's fields from a reachable poll: feeds the
  // banner and tells an open Dashboard the live paused word, same request
  // the beat already made (Aurora-cj11). A test double's fetchStatus that
  // only returns {reachable:true} (no state/errors) reads as "nothing to
  // show", same as a malformed body -- never throws.
  _updateHostState(result) {
    const state = typeof result?.state === 'string' ? result.state : null;
    const errors = Array.isArray(result?.errors) ? result.errors : [];
    const conditions = Array.isArray(result?.conditions) ? result.conditions : [];
    const paused = typeof result?.paused === 'boolean' ? result.paused : null;
    const flags = { usesVideoInput: result?.usesVideoInput, usesAudioInput: result?.usesAudioInput, samplesZones: result?.samplesZones,
      effect: result?.effect, mcpEffectId: result?.mcpEffectId, testActive: result?.test?.active === true };
    this.hostState = state;
    this.hostErrors = errors;
    this.hostConditions = conditions;
    // A live test has no deadline (confirmRemainingMs null): it is still a test.
    const testing = result?.test?.active === true;
    this.lightTestLive = testing && result.test.confirmRemainingMs === null;
    this.lightTestHolder = testing && result.test.holder && typeof result.test.holder === 'object' ? result.test.holder : null;
    const remainingMs = testing && !this.lightTestLive ? Number(result.test.confirmRemainingMs) : NaN;
    this.lightTestEndsAt = Number.isFinite(remainingMs) ? Date.now() + remainingMs : null;
    this._stateReplied = true;
    this._maybeBaseline();
    this._renderBanner();
    if (this.onStateUpdate) this.onStateUpdate({ state, errors, paused, ...flags });
  }

  // The first reply (and the first after the takeover) is the baseline, once everything it counts is in.
  _maybeBaseline() {
    if (this._baselined) return;
    if (!baselineReady({ stateReplied: this._stateReplied, canApprove: this.canApprove, pendingLoaded: this._pendingLoaded })) return;
    this._baselined = true;
    const ordered = orderRows(this._bannerInput());
    this._collapsed = baselineSnapshot(ordered);
    this._knownKeys = new Set(ordered.map((row) => row.key)); // what is there at the baseline is not an arrival
  }

  // app.js calls this after reading /api/pairing/status, which may land after the first poll.
  setCanApprove(canApprove) {
    this.canApprove = canApprove;
    if (canApprove) void this._refreshPending();
    else {
      this._maybeBaseline();
      this._renderBanner();
    }
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
    this._rows = [];
    this.hostState = null;
    this.hostErrors = [];
    this.hostConditions = [];
    this.pendingPairings = [];
    this._pendingLoaded = false;
    this.lightTestEndsAt = null;
    this.lightTestLive = false;
    this.lightTestHolder = null;
    this._collapsed = null;
    this._stateReplied = false;
    this._baselined = false;
    this._knownKeys = null;
    this._stopLightTestTimer();
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
  // So the gate is "before Mode+Device" (Aurora-scig moved it there from
  // "before the Dashboard", so a Capture Source apply failure shows); gating
  // on the route id needs no extra state from app.js's own onboarding walk.
  _visibleErrors() {
    const suppressReload = !RELOAD_ERROR_ROUTES.has(this.currentRouteId);
    return this.hostErrors.filter((error) => !(suppressReload && error.source === 'reload'));
  }

  // The shell's rows as the model lays them out for the current state (shellRows.js).
  _bannerInput() {
    const testing = this.lightTestEndsAt !== null || this.lightTestLive;
    return {
      conditions: this.hostConditions,
      errors: this._visibleErrors(),
      pairings: this.pendingPairings,
      lightTest: testing ? { holder: this.lightTestHolder, endsAtMs: this.lightTestLive ? null : this.lightTestEndsAt } : null,
    };
  }

  // `fresh`: the keys of rows that arrived this render (they pulse); the caller works them out.
  _bannerRowList(fresh = []) {
    const input = this._bannerInput();
    // Nothing is drawn before the baseline; after it, a snapshot the rows no longer match is dropped.
    if (!this._baselined) return [];
    this._collapsed = reconcileSnapshot(orderRows(input), this._collapsed);
    return bannerRows(input, { snapshot: this._collapsed, hostState: this.hostState, platform: this.platform, fresh });
  }

  // The banner's whole markup ('' when there is nothing to say). The page draws it with a keyed
  // patch; this is what unit tests and the editor's markup parity check read.
  _bannerHtml() {
    return bannerHtml(this._bannerRowList());
  }

  _renderBanner() {
    if (!this.bannerSlot) return;
    const testing = this.lightTestEndsAt !== null || this.lightTestLive;
    if (!testing) this._stopLightTestTimer();
    // Arrivals are judged against every key the last render held, drawn or folded, so a row folded
    // into the collapse is not new when the shell opens; a new key opens the shell in this same render
    // (bannerRowList reconciles the snapshot), and the rows that were already there do not pulse.
    const ordered = orderRows(this._bannerInput());
    const fresh = arrivedKeys(ordered, this._knownKeys);
    if (this._baselined) this._knownKeys = new Set(ordered.map((row) => row.key));
    const rows = this._bannerRowList(fresh);
    this._rows = rows;
    // Only rows whose key or content changed are touched, so focus survives a poll.
    applyPatch(this.bannerSlot, rows);
    if (fresh.length > 0) {
      this._announce(arrivalAnnouncement(ordered, fresh, { hostState: this.hostState, platform: this.platform }));
    }
    this._cap.render(this.bannerSlot);
    if (testing) this._startLightTestTimer();
  }

  // Says `text` in the polite live region. Parts raised within the short delay (one poll can render
  // twice: state, then pending pairings) go out as one announcement. Empty first so the same words
  // twice in a row are still a change; cleared after a while.
  _announce(text) {
    if (!this.announcer || !text) return;
    this._announceParts.push(text);
    if (this._announceTimer !== null) return;
    clearTimeout(this._announceClearTimer);
    this.announcer.textContent = '';
    this._announceTimer = setTimeout(() => {
      this._announceTimer = null;
      this.announcer.textContent = this._announceParts.join(' ');
      this._announceParts = [];
      this._announceClearTimer = setTimeout(() => { this.announcer.textContent = ''; }, ANNOUNCE_CLEAR_MS);
      this._announceClearTimer.unref?.();
    }, ANNOUNCE_DELAY_MS);
    this._announceTimer.unref?.();
  }

  // A banner button was pressed: `action` and `key` come from its data-action and data-key.
  async _act(action, key) {
    const row = this._rows.find((candidate) => candidate.key === key);
    if (!row) return;
    switch (action) {
      case 'toggle':
        // Collapsing stores the keys on screen; opening drops them.
        this._collapsed = row.collapsed ? null : collapsibleKeys(orderRows(this._bannerInput()));
        this._renderBanner();
        return;
      case 'retry': return this._retry(row.source);
      case 'dismiss': return this._dismiss(row.error);
      case 'stop-test': return this._stopLightTest();
      case 'approve': return this._decidePairing(row.request.ref, 'approve');
      case 'deny': return this._decidePairing(row.request.ref, 'deny');
      default:
    }
  }

  _lightTestClock() {
    return clockText(this.lightTestEndsAt);
  }

  // Ticks only the clock text so the Stop button keeps focus between polls.
  _startLightTestTimer() {
    if (this._lightTestTimer !== null) return;
    this._lightTestTimer = setInterval(() => {
      const time = this.bannerSlot?.querySelector('#shell-light-test-time');
      if (time && this.lightTestEndsAt !== null) time.textContent = this._lightTestClock();
    }, 1000);
    this._lightTestTimer.unref?.();
  }

  _stopLightTestTimer() {
    if (this._lightTestTimer === null) return;
    clearInterval(this._lightTestTimer);
    this._lightTestTimer = null;
  }

  // The re-poll shows what the daemon holds (a test that already ended just goes).
  async _stopLightTest() {
    try {
      await fetch('/api/graph/test/stop', { method: 'POST' });
    } catch {
      // Unreachable is the beat's takeover.
    }
    await this.checkNow();
  }

  // No optimistic removal: the re-read shows what the daemon holds (an
  // expired request just disappears, same as a decided one).
  async _decidePairing(ref, decision) {
    // Pairing.js decidePairing, the same call the editor makes. Unreachable is the beat's takeover.
    const accepted = await decidePairing(ref, decision);
    const approved = decision === 'approve' && accepted;
    await this._refreshPending();
    if (approved && this.onPairedDevicesChanged) this.onPairedDevicesChanged();
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
