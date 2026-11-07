// DashboardScreen pause pair (Aurora-5ipy.13): the top bar shows Pause
// (pause glyph) while running and Resume (play glyph) while paused, beside
// a lighter-grey Stop; toggling PUTs /api/state with the flipped running
// flag. No DOM needed -- prototype-called methods against a container
// double, fetch stubbed per case. Run with
// `node screens/DashboardScreen.test.mjs`.
import assert from 'node:assert/strict';
import { DashboardScreen } from './DashboardScreen.js';
import { ensureTooltips } from '../Tooltips.js';
import { isSwitchErrorStale, runningToggle } from '../CaptureSource.js';
import { DAEMON_UNREACHABLE } from '../messages.js';
import { VIDEO_HINT, AUDIO_HINT } from '../DeviceField.js';

function makeEl() {
  return {
    innerHTML: '',
    listeners: {},
    addEventListener(event, fn) {
      (this.listeners[event] ??= []).push(fn);
    },
    querySelector() {
      return makeEl();
    },
    removeAttribute(name) {
      delete this[name];
    },
  };
}

// Outer container double: the top-bar slot element persists across renders
// so each _renderTopBar overwrites the same slot, like the real DOM.
function fakeScreen(overrides = {}) {
  const slot = makeEl();
  const stubs = new Map();
  slot.querySelector = (sel) => {
    if (!stubs.has(sel)) stubs.set(sel, makeEl());
    return stubs.get(sel);
  };
  const checkNowCalls = [];
  const inst = Object.create(DashboardScreen.prototype);
  inst.paused = false;
  inst.pauseBusy = false;
  inst.canStop = true; // mirrors the constructor default (Aurora-ifkn.3)
  inst.zeroOffOutputs = []; // mirrors the constructor default (Aurora-4zr.11)
  inst.topTierErrors = {};
  inst.container = { querySelector: (sel) => (sel === '.top-bar-slot' ? slot : makeEl()) };
  inst._renderTopTier = () => {};
  // Shell-beat double (Aurora-ewyz): records immediate re-checks. Tests
  // override `app` when the verdict matters (false = outage stands).
  inst.app = { checkNow: async () => { checkNowCalls.push(1); return true; } };
  Object.assign(inst, overrides);
  return { inst, slot, stubs, checkNowCalls };
}

const realFetch = globalThis.fetch;

// Running: pause glyph + Pause label; Stop keeps the power glyph on the
// lighter-grey class.
{
  const { inst, slot } = fakeScreen();
  inst._renderTopBar();
  assert.ok(slot.innerHTML.includes('pause-rockyroad.svg'), 'pause glyph while running');
  assert.ok(!slot.innerHTML.includes('src="icons'), 'icon resolves against the module, not the page URL');
  assert.ok(slot.innerHTML.includes('aria-label="Pause"'), 'Pause label while running');
  assert.ok(slot.innerHTML.includes('power-svgrepo-com.svg'), 'power glyph present');
  assert.ok(slot.innerHTML.includes('top-bar-power-btn'), 'power button lighter than pause');
}

// Paused: play glyph + Resume label, same stable id.
{
  const { inst, slot } = fakeScreen({ paused: true });
  inst._renderTopBar();
  assert.ok(slot.innerHTML.includes('play-rockyroad.svg'), 'play glyph while paused');
  assert.ok(slot.innerHTML.includes('aria-label="Resume"'), 'Resume label while paused');
  assert.ok(slot.innerHTML.includes('id="top-bar-pause-btn"'), 'pause button id stable');
}

// Busy flight: pause disabled, stop untouched.
{
  const { inst, slot } = fakeScreen({ pauseBusy: true });
  inst._renderTopBar();
  const pauseTag = slot.innerHTML.match(/<button[^>]*id="top-bar-pause-btn"[^>]*>/)?.[0] ?? '';
  assert.ok(pauseTag.includes('disabled'), 'pause disabled mid-flight');
}

// Failed host (Aurora-cj11): Pause/Resume is hidden entirely -- there is no
// pipeline to act on, and the banner's Retry is the resolve action now --
// Stop stays, since stopping a failed daemon is still meaningful.
{
  const { inst, slot } = fakeScreen({ hostState: 'failed' });
  inst._renderTopBar();
  assert.ok(!slot.innerHTML.includes('id="top-bar-pause-btn"'), 'pause button absent while failed');
  assert.ok(slot.innerHTML.includes('id="top-bar-stop-btn"'), 'stop button still present');
}

// Stop capability (Aurora-ifkn.3): a host without a Stop path hides the
// button entirely while Pause stays; an absent flag keeps the button, so
// old binaries (and doubles that never ran the constructor) read as
// stoppable.
{
  const { inst, slot } = fakeScreen({ canStop: false });
  inst._renderTopBar();
  assert.ok(!slot.innerHTML.includes('id="top-bar-stop-btn"'), 'stop hidden without the capability');
  assert.ok(slot.innerHTML.includes('id="top-bar-pause-btn"'), 'pause unaffected by the capability');
}
{
  const { inst, slot } = fakeScreen();
  delete inst.canStop;
  inst._renderTopBar();
  assert.ok(slot.innerHTML.includes('id="top-bar-stop-btn"'), 'absent flag keeps stop');
}

// Shell heartbeat push (Aurora-cj11): paused/hostState update and the top
// bar re-renders, with no _loadAll round trip.
{
  let rendered = 0;
  const { inst } = fakeScreen({ paused: false, hostState: 'running', _renderTopBar: () => { rendered++; } });
  inst._onHeartbeatState({ state: 'running', paused: false });
  assert.equal(rendered, 0, 'no re-render when nothing changed');
  inst._onHeartbeatState({ state: 'paused', paused: true });
  assert.equal(inst.paused, true);
  assert.equal(inst.hostState, 'paused');
  assert.equal(rendered, 1);
  inst._onHeartbeatState({ state: 'failed', paused: true });
  assert.equal(inst.hostState, 'failed');
  assert.equal(rendered, 2, 'hostState-only change still re-renders');
}

// Stop capability over the beat (Aurora-ifkn.3): the flag rides the same
// GET /api/state payload; absent keeps the button, a flip re-renders.
{
  let rendered = 0;
  const { inst } = fakeScreen({ paused: false, hostState: 'running', _renderTopBar: () => { rendered++; } });
  inst._onHeartbeatState({ state: 'running', paused: false });
  assert.equal(rendered, 0, 'absent flag keeps stop with no re-render');
  inst._onHeartbeatState({ state: 'running', paused: false, canStop: false });
  assert.equal(inst.canStop, false);
  assert.equal(rendered, 1, 'losing the capability re-renders');
  inst._onHeartbeatState({ state: 'running', paused: false, canStop: false });
  assert.equal(rendered, 1, 'unchanged capability does not re-render');
  inst._onHeartbeatState({ state: 'running', paused: false, canStop: true });
  assert.equal(inst.canStop, true);
  assert.equal(rendered, 2, 'regaining the capability re-renders');
}

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { json: async () => handler(calls.length, options) };
  };
  return calls;
}

// Toggle while running pauses: PUT {running:false}, then reloads.
{
  const calls = stubFetch(() => ({ succeeded: true, running: false }));
  let reloaded = 0;
  const { inst, slot } = fakeScreen({ _loadAll: async () => { reloaded++; } });
  try {
    await inst._togglePause();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/state');
  assert.equal(calls[0].options.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].options.body), { running: false });
  assert.equal(reloaded, 1, 'sections reload after pause');
  assert.equal(inst.pauseBusy, false, 'busy flag resets');
  assert.ok(!slot.innerHTML.includes('disabled'), 'pause re-enabled after flight');
}

// Toggle while paused resumes: PUT {running:true}.
{
  const calls = stubFetch(() => ({ succeeded: true, running: true }));
  const { inst } = fakeScreen({ paused: true, _loadAll: async () => {} });
  try {
    await inst._togglePause();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(JSON.parse(calls[0].options.body), { running: true });
}

// Rejected PUT surfaces a pause/resume error and never reloads.
{
  const calls = stubFetch(() => ({ succeeded: false, error: 'boom' }));
  let reloaded = 0;
  let renderedTopTier = 0;
  const { inst } = fakeScreen({
    _loadAll: async () => { reloaded++; },
    _renderTopTier: () => { renderedTopTier++; },
  });
  try {
    await inst._togglePause();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls.length, 1);
  assert.equal(reloaded, 0, 'no reload on rejected toggle');
  assert.equal(inst.topTierErrors.pause, "Couldn't pause Aurora.");
  assert.equal(renderedTopTier, 1);
}

// Rejected resume (a failed build the daemon holds): no inline copy, the
// shell banner owns it (Aurora-98pr); the beat gets one immediate re-check.
{
  stubFetch(() => ({ succeeded: false, error: 'boom' }));
  let renderedTopTier = 0;
  const { inst, checkNowCalls } = fakeScreen({
    paused: true,
    _renderTopTier: () => { renderedTopTier++; },
  });
  try {
    await inst._togglePause();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(inst.topTierErrors, {});
  assert.equal(renderedTopTier, 0);
  assert.equal(checkNowCalls.length, 1);
  assert.equal(inst.pauseBusy, false);
}

// Unreachable daemon (Aurora-ewyz): no inline error -- the shell takeover
// owns the case, so one message, not two. The beat gets one immediate
// re-check that also reads as down.
{
  globalThis.fetch = async () => { throw new Error('down'); };
  let renderedTopTier = 0;
  const { inst, checkNowCalls } = fakeScreen({
    _renderTopTier: () => { renderedTopTier++; },
    app: null,
  });
  inst.app = { checkNow: async () => { checkNowCalls.push(1); return false; } };
  try {
    await inst._togglePause();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(inst.topTierErrors, {});
  assert.equal(renderedTopTier, 0);
  assert.equal(checkNowCalls.length, 1);
  assert.equal(inst.pauseBusy, false);
}

// Blip: the PUT throws but the daemon answers the re-check, so the failed
// resume still gets its own error (no silent failure).
{
  globalThis.fetch = async (url) => {
    if (url === '/api/state') throw new Error('blip');
    return { json: async () => ({}) };
  };
  let renderedTopTier = 0;
  const { inst, checkNowCalls } = fakeScreen({
    paused: true,
    _renderTopTier: () => { renderedTopTier++; },
  });
  try {
    await inst._togglePause();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(inst.topTierErrors.pause, "Couldn't resume Aurora.");
  assert.equal(renderedTopTier, 1);
  assert.equal(checkNowCalls.length, 1);
  assert.equal(inst.pauseBusy, false);
}

// Tooltips land on the buttons themselves, where the hover does -- not the
// inner icons (which carry alt="").
{
  globalThis.fetch = async () => ({
    json: async () => ({
      descriptors: [
        { key: 'app.pause', description: 'Play/Pause' },
        { key: 'app.stop', description: 'Stop and Quit' },
      ],
    }),
  });
  try {
    await ensureTooltips();
  } finally {
    globalThis.fetch = realFetch;
  }
  // Render now the cache holds copy, so titles apply.
  const fresh = fakeScreen();
  fresh.inst._renderTopBar();
  assert.equal(fresh.stubs.get('#top-bar-pause-btn').title, 'Play/Pause');
  assert.equal(fresh.stubs.get('#top-bar-stop-btn').title, 'Stop and Quit');
}

// Double click mid-flight issues a single PUT.
{
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { json: async () => ({ succeeded: true, running: false }) };
  };
  const { inst } = fakeScreen({ _loadAll: async () => {} });
  try {
    await Promise.all([inst._togglePause(), inst._togglePause()]);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(fetches, 1, 'second click while busy is a no-op');
}

// ---- Mode-switch error (Aurora-tazx): one message, kept until confirmed ----

// state/errors (Aurora-cj11): real fixture values, not the placeholder
// gap webui-testing.md:162 warns about -- 'running' so a hostState read
// these scenarios didn't originally anticipate stays accurate instead of
// silently reading as 'failed' (Node's undefined !== 'failed' would have
// hidden this by accident, not by a real assertion).
const VIDEO_STATE = { state: 'running', errors: [], paused: false, usesVideoInput: true, usesAudioInput: false, samplesZones: true, audioDevicesUrl: null };
const AUDIO_STATE = { state: 'running', errors: [], paused: false, usesVideoInput: false, usesAudioInput: true, samplesZones: false, audioDevicesUrl: null };

// A switch screen double: _loadAll applies `loaded()` the way the real one
// does (flags/state from the running pipeline, then the stale-error rule);
// renders are counted instead of touching a DOM.
const BUILTINS = [
  { id: 'builtin.video', builtin: true, title: 'Screen colors' },
  { id: 'builtin.audio', builtin: true, title: 'Music pulse' },
];

function switchScreen({ state, platform = 'mac', toggleError = null, toggleErrorMode = null }) {
  const calls = { controls: 0, topTier: 0, checkNow: 0 };
  const inst = Object.create(DashboardScreen.prototype);
  Object.assign(inst, {
    app: { checkNow: async () => { calls.checkNow++; } },
    platform, hasAudio: true, mode: 'audio', pendingMode: null,
    inputs: ['mac'], audioInputs: ['mac-audio'],
    currentActiveInputName: '', currentActiveAudioInputName: 'mac-audio',
    monitors: [], selectedMonitorName: '', sinkName: '',
    toggleError, toggleErrorMode, topTierErrors: {},
    pipelineState: state, effects: BUILTINS,
    _clearToggleError: DashboardScreen.prototype._clearToggleError,
    _renderControls() { calls.controls++; },
    _renderTopTier() { calls.topTier++; },
    async _loadAll() {
      this.pipelineState = this.nextState ?? this.pipelineState;
      // the same stale-error rule the real _loadAll applies
      if (this.toggleError && isSwitchErrorStale(this.pipelineState, this.toggleErrorMode, this.toggleErrorEffectId, this.toggleErrorRunning)) {
        this._clearToggleError();
      }
      return !this.daemonDown;
    },
  });
  return { inst, calls };
}

const PERMISSION_ERROR = 'permission_denied: ScreenCaptureKitGrabber: no shareable displays';

// Saved, not applied (Aurora-98pr): the daemon holds the error and the shell
// banner shows it, so no inline copy -- the mutant check for the removal.
// The fill is still re-derived from the running pipeline, and the beat gets
// one immediate re-check so the banner does not wait for the next poll.
for (const reloadError of [PERMISSION_ERROR, 'bridge unreachable']) {
  stubFetch(() => ({ succeeded: true, reloadError }));
  const { inst, calls } = switchScreen({ state: AUDIO_STATE });
  try { await inst._switchMode('video', 'builtin.video'); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.toggleError, null, 'banner owns the failure');
  assert.equal(inst.toggleErrorMode, null);
  assert.equal(inst.mode, 'audio', 'fill stays on the running mode');
  assert.equal(inst.pendingMode, null);
  assert.equal(calls.checkNow, 1);
}

// Device save, same rule: no topTierErrors entry for a saved-not-applied reload.
{
  stubFetch(() => ({ succeeded: true, reloadError: PERMISSION_ERROR }));
  const { inst, calls } = switchScreen({ state: AUDIO_STATE });
  inst.flags = { usesVideoInput: false, usesAudioInput: true, samplesZones: false };
  try { await inst._onDeviceFieldChange({}); } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(inst.topTierErrors, {}, 'banner owns the failure');
  assert.equal(calls.topTier, 0);
  assert.equal(calls.checkNow, 1);
}

// A plain rejection (succeeded:false) stays inline even with a held error
// (decision 8).
{
  stubFetch(() => ({ succeeded: false }));
  const { inst } = switchScreen({ state: AUDIO_STATE });
  inst.app.hostErrors = [{ source: 'reload', message: PERMISSION_ERROR, id: 1 }];
  try { await inst._switchMode('video', 'builtin.video'); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.toggleError, "Screen colors didn't start.");
  assert.equal(inst.mode, 'audio');
}

// Plain rejections say which switch failed.
{
  stubFetch(() => ({ succeeded: false }));
  const { inst } = switchScreen({ state: VIDEO_STATE });
  inst.mode = 'video';
  try { await inst._switchMode('audio', 'builtin.audio'); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.toggleError, "Music pulse didn't start.");
  assert.equal(inst.toggleErrorMode, 'audio');
}

// The error is NOT cleared by the click: it is still set while the retry is
// in flight (no hide/re-show), and a retry that fails again leaves one message.
{
  let errorDuringFlight = 'unset';
  const { inst } = switchScreen({ state: AUDIO_STATE, toggleError: PERMISSION_ERROR, toggleErrorMode: 'video' });
  globalThis.fetch = async () => {
    errorDuringFlight = inst.toggleError;
    return { json: async () => ({ succeeded: false }) };
  };
  try { await inst._switchMode('video', 'builtin.video'); } finally { globalThis.fetch = realFetch; }
  assert.equal(errorDuringFlight, PERMISSION_ERROR, 'error stays up while the retry is pending');
  assert.equal(inst.toggleError, "Screen colors didn't start.", 'a retry that fails again leaves one message');
}

// A confirmed switch clears the error and re-renders the top tier so the
// audio banner (gated on toggleError) can come back.
{
  stubFetch(() => ({ succeeded: true }));
  const { inst, calls } = switchScreen({ state: AUDIO_STATE, toggleError: PERMISSION_ERROR, toggleErrorMode: 'video' });
  inst.nextState = VIDEO_STATE;
  try { await inst._switchMode('video', 'builtin.video'); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.toggleError, null);
  assert.equal(inst.toggleErrorMode, null);
  assert.equal(inst.mode, 'video');
  assert.ok(calls.topTier >= 1, 'top tier re-rendered after the error clears');
}

// A confirmed switch clears an older error about the OTHER mode too (the
// flag-match rule alone would keep it: the pipeline is not that mode).
{
  stubFetch(() => ({ succeeded: true }));
  const { inst } = switchScreen({ state: AUDIO_STATE, toggleError: "Music pulse didn't start.", toggleErrorMode: 'audio' });
  inst.nextState = VIDEO_STATE;
  try { await inst._switchMode('video', 'builtin.video'); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.toggleError, null, 'confirmed switch clears an error about the other mode');
  assert.equal(inst.mode, 'video');
}

// A switch while paused succeeds without building (flags unchanged, not
// confirmed): an existing error is left alone and none is added.
{
  stubFetch(() => ({ succeeded: true }));
  const paused = { ...AUDIO_STATE, paused: true };
  const { inst } = switchScreen({ state: paused, toggleError: PERMISSION_ERROR, toggleErrorMode: 'video' });
  try { await inst._switchMode('video', 'builtin.video'); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.toggleError, PERMISSION_ERROR, 'paused no-op switch keeps the error');
  assert.equal(inst.mode, 'audio', 'no false confirm while paused');
}
{
  stubFetch(() => ({ succeeded: true }));
  const paused = { ...AUDIO_STATE, paused: true };
  const { inst } = switchScreen({ state: paused });
  try { await inst._switchMode('video', 'builtin.video'); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.toggleError, null, 'paused no-op switch adds no error');
}

// The audio permission block lives in the shell banner now (Aurora-h457):
// the top tier never renders it inline, whatever the flags say.
{
  const topTier = makeEl();
  const inst = Object.create(DashboardScreen.prototype);
  Object.assign(inst, {
    platform: 'mac', toggleError: null, topTierErrors: {}, deviceField: null,
    flags: { usesVideoInput: false, usesAudioInput: true, samplesZones: false },
    audioDevicesUrl: null, monitors: [], selectedMonitorName: '', sinkName: '',
    container: { querySelector: (sel) => (sel === '.db-top-tier' ? topTier : makeEl()) },
  });
  inst._renderTopTier();
  inst.deviceField?.destroy();
  assert.ok(!topTier.innerHTML.includes("Aurora can't hear any audio."), 'no inline audio permission block');
}

// Under a custom effect the default-device hints follow the graph's declared inputs (Aurora-tc8w).
{
  const hintsFor = (mode, graphInputs, flags) => {
    const slot = makeEl();
    const topTier = { innerHTML: '', querySelector: () => slot };
    const inst = Object.create(DashboardScreen.prototype);
    Object.assign(inst, {
      platform: 'windows', toggleError: null, topTierErrors: {}, deviceField: null, mode,
      pipelineState: { graphInputs }, flags,
      audioDevicesUrl: null, monitors: [], selectedMonitorName: '', sinkName: '',
      container: { querySelector: (sel) => (sel === '.db-top-tier' ? topTier : makeEl()) },
    });
    inst._renderTopTier();
    inst.deviceField?.destroy();
    return { video: slot.innerHTML.includes(VIDEO_HINT), audio: slot.innerHTML.includes(AUDIO_HINT), field: !!inst.deviceField };
  };
  const both = { usesVideoInput: true, usesAudioInput: true, samplesZones: true };
  // The flags still say video (config mode), as for a rainbow graph: the graph wins under a custom effect.
  assert.deepEqual(hintsFor('custom', { video: true, audio: true }, both), { video: true, audio: true, field: true });
  assert.deepEqual(hintsFor('custom', { video: false, audio: true }, both), { video: false, audio: true, field: true });
  assert.deepEqual(hintsFor('custom', { video: false, audio: false }, both), { video: false, audio: false, field: false });
  assert.deepEqual(hintsFor('audio', null, { ...both, usesVideoInput: false }), { video: false, audio: true, field: true });
  assert.deepEqual(hintsFor('custom', null, both), { video: true, audio: true, field: true });
}

// No Mac audio-status fetch: the audio poll only asks Linux's sink route.
{
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(url); return { json: async () => ({}) }; };
  const inst = Object.create(DashboardScreen.prototype);
  Object.assign(inst, { platform: 'mac', flags: { usesAudioInput: true }, audioStatusTimer: 1, audioSinkStatus: null });
  const realSetTimeout = globalThis.setTimeout;
  let scheduled = null;
  globalThis.setTimeout = (fn) => { scheduled = fn; return 1; };
  try {
    inst._startAudioStatusPoll();
    await scheduled();
  } finally { globalThis.setTimeout = realSetTimeout; globalThis.fetch = realFetch; inst._stopAudioStatusPoll(); }
  assert.deepEqual(urls, [], 'mac audio mode polls nothing');
}

// A running-mode change from outside the toggle (banner Retry, tray) makes
// the heartbeat re-derive the screen once; not while our own switch runs.
{
  const make = (pendingMode) => {
    const inst = Object.create(DashboardScreen.prototype);
    let loads = 0;
    Object.assign(inst, {
      pendingMode, pipelineState: AUDIO_STATE, paused: false, hostState: 'running',
      _renderTopBar() {}, _loadAll() { loads += 1; return Promise.resolve(true); },
    });
    return { inst, loads: () => loads };
  };
  const video = { state: 'running', paused: false, usesVideoInput: true, usesAudioInput: false, samplesZones: true };
  const same = make(null);
  same.inst._onHeartbeatState({ ...AUDIO_STATE });
  assert.equal(same.loads(), 0, 'same flags: no reload');
  const changed = make(null);
  changed.inst._onHeartbeatState(video);
  changed.inst._onHeartbeatState(video);
  assert.equal(changed.loads(), 1, 'changed flags reload once');
  const busy = make('video');
  busy.inst._onHeartbeatState(video);
  assert.equal(busy.loads(), 0, 'not while our own switch runs');
  const idle = make(null);
  idle.inst._onHeartbeatState({ state: 'failed', paused: false });
  assert.equal(idle.loads(), 0, 'idle/failed flags are not a mode change');
}

// ---- One daemon-unreachable message, one wording (Aurora-jm6s) ----

assert.equal(DAEMON_UNREACHABLE, "Couldn't reach the daemon.", 'the shared wording is the Couldn\'t form');

// Daemon gone: the failed PUT adds no toggle error -- the shell takeover
// owns the case, so one message, not two.
{
  globalThis.fetch = async () => { throw new Error('down'); };
  const { inst, calls } = switchScreen({ state: AUDIO_STATE });
  inst.daemonDown = true;
  try { await inst._switchMode('video', 'builtin.video'); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.toggleError, null, 'no toggle error for an unreachable daemon');
  assert.equal(inst.toggleErrorMode, null);
  assert.equal(calls.topTier, 0, 'top tier left to _loadAll');
  assert.equal(inst.pendingMode, null, 'pending outline cleared');
  assert.equal(inst.mode, 'audio', 'fill stays on the running mode');
}

// Transient failure (Aurora-ewyz): the PUT could not connect but the daemon
// answers the reload, so the failed switch still gets its own error (no
// silent failure) -- and it is the action's error, never the unreachable
// wording (components.md:308).
{
  globalThis.fetch = async () => { throw new Error('blip'); };
  const { inst, calls } = switchScreen({ state: AUDIO_STATE });
  try { await inst._switchMode('video', 'builtin.video'); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.toggleError, "Screen colors didn't start.");
  assert.equal(inst.toggleErrorMode, 'video');
  assert.equal(calls.topTier, 1, 'top tier re-rendered so the audio banner yields');
  assert.equal(calls.checkNow, 1, 'the beat gets one immediate re-check');
}

// _loadAll with the daemon gone (Aurora-ewyz): nothing inline -- the shell
// takeover owns it -- one beat poke, and a false return so callers can
// tell it did not load.
{
  const topTier = makeEl();
  globalThis.fetch = async () => { throw new Error('down'); };
  const inst = Object.create(DashboardScreen.prototype);
  inst.container = { querySelector: (sel) => (sel === '.db-top-tier' ? topTier : makeEl()) };
  let checkNowCalls = 0;
  inst.app = { checkNow: async () => { checkNowCalls++; return false; } };
  let loaded;
  try { loaded = await inst._loadAll(); } finally { globalThis.fetch = realFetch; }
  assert.equal(loaded, false);
  assert.equal(topTier.innerHTML, '', 'no inline error for an unreachable daemon');
  assert.equal(checkNowCalls, 1);
}

// ---- topTierErrors owners (Aurora-m0fy): each control clears only its own ----

// Counts top-tier repaints and records the rows on screen each time, so a
// cleared error that was never repainted shows up as a stale snapshot.
function ownerScreen(extra = {}) {
  const painted = [];
  const { inst, checkNowCalls } = fakeScreen({
    _renderTopTier() { painted.push({ ...this.topTierErrors }); },
    ...extra,
  });
  return { inst, painted, checkNowCalls };
}

// Failed-then-successful device save clears its own error and repaints.
{
  const { inst, painted } = ownerScreen({
    flags: { usesVideoInput: true, usesAudioInput: false, samplesZones: true },
    monitors: [], selectedMonitorName: '', sinkName: '',
  });
  stubFetch(() => ({ succeeded: false }));
  try { await inst._onDeviceFieldChange({}); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.topTierErrors.deviceSave, "Couldn't save capture settings.");
  stubFetch(() => ({ succeeded: true }));
  try { await inst._onDeviceFieldChange({}); } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(inst.topTierErrors, {}, 'confirmed save clears its own error');
  assert.deepEqual(painted.at(-1), {}, 'and the clear is painted');
}

// The click alone does not clear: a retry that is still in flight keeps the
// old message (cleared only by a confirmed result).
{
  const { inst } = ownerScreen({
    flags: { usesVideoInput: true, usesAudioInput: false, samplesZones: true },
    monitors: [], selectedMonitorName: '', sinkName: '',
  });
  inst.topTierErrors.deviceSave = "Couldn't save capture settings.";
  let release;
  globalThis.fetch = () => new Promise((r) => { release = () => r({ json: async () => ({ succeeded: true }) }); });
  const pending = inst._onDeviceFieldChange({});
  assert.equal(inst.topTierErrors.deviceSave, "Couldn't save capture settings.", 'kept while retry runs');
  release();
  try { await pending; } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(inst.topTierErrors, {});
}

// An unrelated success leaves another control's error alone: device-save
// error survives a good auto-arrange, a good pause, and a good config switch.
{
  const { inst } = ownerScreen({
    zones: [{ zoneId: 1, active: true }],
    _loadZoneData: async () => {}, _renderZoneMappingContent() {}, _renderBridgeZoneList() {},
    _loadAll: async () => {},
  });
  inst.topTierErrors.deviceSave = "Couldn't save capture settings.";
  stubFetch(() => ({ succeeded: true }));
  try {
    await inst._onAutoDivideClick({ disabled: false });
    await inst._togglePause();
    await inst._onEntertainmentConfigChange('cfg', {});
  } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.topTierErrors.deviceSave, "Couldn't save capture settings.");
}

// Pause: failed then successful clears its own error.
{
  const { inst, painted } = ownerScreen({ _loadAll: async () => {} });
  stubFetch(() => ({ succeeded: false }));
  try { await inst._togglePause(); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.topTierErrors.pause, "Couldn't pause Aurora.");
  stubFetch(() => ({ succeeded: true }));
  try { await inst._togglePause(); } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(inst.topTierErrors, {});
  assert.deepEqual(painted.at(-1), {});
}

// Auto-arrange: success repaints the top tier (a failed attempt's text must
// leave the screen), failure and the no-active-zones case are painted.
{
  const { inst, painted } = ownerScreen({
    zones: [{ zoneId: 1, active: true }, { zoneId: 2, active: false }],
    _loadZoneData: async () => {}, _renderZoneMappingContent() {}, _renderBridgeZoneList() {},
  });
  stubFetch(() => ({ succeeded: false }));
  try { await inst._onAutoDivideClick({ disabled: false }); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.topTierErrors.autoArrange, "Couldn't save the auto-arranged zones.");
  assert.equal(painted.at(-1).autoArrange, "Couldn't save the auto-arranged zones.", 'failure painted');
  stubFetch(() => ({ succeeded: true }));
  try { await inst._onAutoDivideClick({ disabled: false }); } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(inst.topTierErrors, {});
  assert.deepEqual(painted.at(-1), {}, 'success repaints the top tier');

  inst.zones = [{ zoneId: 1, active: false }];
  await inst._onAutoDivideClick({ disabled: false });
  assert.equal(inst.topTierErrors.autoArrange, 'No active zones to arrange.');
  assert.equal(painted.at(-1).autoArrange, 'No active zones to arrange.', 'painted, not just stored');
}

// A saved switch clears a rejected one's row; a reload that failed after the
// save adds no inline row and pokes the beat (the shell banner owns it).
{
  const { inst, checkNowCalls } = ownerScreen({ _loadZoneData: async () => {}, _renderZoneMappingContent() {}, _renderBridgeZoneList() {} });
  inst.topTierErrors.entertainmentConfig = "Couldn't switch entertainment configuration.";
  await inst._onEntertainmentConfigChange('cfg', { reloadError: 'x' });
  assert.deepEqual(inst.topTierErrors, {});
  assert.equal(checkNowCalls.length, 1);
  await inst._onEntertainmentConfigChange('cfg', {});
  assert.equal(checkNowCalls.length, 1, 'clean switch needs no poke');
}

// Wiring: the real constructor's select forwards the reload result, and a
// reload failure through it adds no inline row.
{
  const checks = [];
  const inst = new DashboardScreen({ checkNow: async () => { checks.push(1); return true; } });
  inst._loadZoneData = async () => {}; inst._renderZoneMappingContent = () => {}; inst._renderBridgeZoneList = () => {};
  inst._renderTopTier = () => {};
  await inst.entertainmentConfigSelect.onChange('cfg', { reloadError: 'x' });
  assert.equal(checks.length, 1, 'result reaches the Dashboard handler');
  assert.deepEqual(inst.topTierErrors, {});
  inst.entertainmentConfigSelect.onError("Couldn't switch entertainment configuration.");
  assert.ok(inst.topTierErrors.entertainmentConfig, 'rejected switch still shows inline');
}

// Zone toggle success (queue onSuccess) clears only the zoneToggle row.
{
  const { inst } = ownerScreen();
  inst.topTierErrors.zoneToggle = "Couldn't save a zone edit.";
  inst.topTierErrors.zoneCanvas = "Couldn't save a zone edit.";
  inst._clearTopTierError('zoneToggle');
  assert.deepEqual(Object.keys(inst.topTierErrors), ['zoneCanvas']);
}

// Two errors at once both render, each as its own row, in place on reword.
{
  const topTier = makeEl();
  const inst = Object.create(DashboardScreen.prototype);
  Object.assign(inst, {
    platform: 'linux', toggleError: null, topTierErrors: {}, deviceField: null,
    flags: { usesVideoInput: true, usesAudioInput: false, samplesZones: true },
    audioDevicesUrl: null, monitors: [], selectedMonitorName: '', sinkName: '',
    container: { querySelector: (sel) => (sel === '.db-top-tier' ? topTier : makeEl()) },
  });
  inst._setTopTierError('deviceSave', "Couldn't save capture settings.");
  inst._setTopTierError('autoArrange', "Couldn't save the auto-arranged zones.");
  assert.ok(topTier.innerHTML.includes("Couldn't save capture settings."));
  assert.ok(topTier.innerHTML.includes("Couldn't save the auto-arranged zones."));
  inst._setTopTierError('deviceSave', 'Reworded.');
  assert.ok(!topTier.innerHTML.includes("Couldn't save capture settings."));
  assert.ok(topTier.innerHTML.indexOf('Reworded.') < topTier.innerHTML.indexOf('auto-arranged'), 'row keeps its place');
  inst.deviceField?.destroy();
}

// Toggle-sync pair (Aurora-ifkn.5): the canvas and the Bridge list show the
// same shared zone objects, so a flip on one side refreshes the other.
// Prototype-called against doubles -- no DOM needed.
{
  const { inst } = fakeScreen();
  let rendered = 0;
  inst._renderBridgeZoneList = () => { rendered++; };
  inst._onZoneCanvasActiveChange();
  assert.equal(rendered, 1);
}
{
  const { inst } = fakeScreen();
  let refreshed = 0;
  inst.zoneCanvas = { refreshActive: () => { refreshed++; } };
  inst._onBridgeZoneToggle();
  assert.equal(refreshed, 1);
}
{
  // No canvas mounted yet (Bridge renders before the top tier): a no-op,
  // never throws.
  const { inst } = fakeScreen();
  inst.zoneCanvas = null;
  inst._onBridgeZoneToggle();
}

// Output section (Aurora-d7s): content comes from a per-output table. Hue
// keeps its 'Bridge' title and markup, an output the table lacks gets the
// generic placeholder and title.
{
  const { inst } = fakeScreen();
  inst.output = 'hue';
  assert.equal(inst._outputEntry().title, 'Bridge');
  const content = makeEl();
  inst.entertainmentConfigSelect = { mount() {} };
  inst.outputSection = { content };
  inst._renderBridgeZoneList = () => {};
  inst.bridgeConfigured = true;
  inst.bridgeAddress = '10.0.0.2';
  inst._renderOutputContent();
  assert.ok(content.innerHTML.includes('Connected to 10.0.0.2'));
  assert.ok(content.innerHTML.includes('id="db-change-bridge"'));
  assert.ok(content.innerHTML.includes('db-bridge-zones-slot'));
}
{
  const { inst } = fakeScreen();
  inst.output = null;
  assert.equal(inst._outputEntry(), null);
  const content = makeEl();
  inst.outputSection = { content };
  inst._renderOutputContent();
  assert.ok(content.innerHTML.includes('Not available in this build.'));
}

// The editor probe (Aurora-pvxx.8) only gates the row menus' Edit graph item.
{
  const { inst } = fakeScreen();
  const updates = [];
  inst.effectPanel = { update: (a) => updates.push(a) };
  const html = { ok: true, headers: { get: () => 'text/html' } };
  globalThis.fetch = async (url) => { assert.equal(url, '/graph-editor/'); return html; };
  await inst._probeGraphEditor();
  assert.equal(inst.graphEditorAvailable, true);
  assert.deepEqual(updates, [{ canEdit: true }]);
  globalThis.fetch = async () => ({ ok: false, headers: { get: () => null } });
  await inst._probeGraphEditor();
  assert.equal(inst.graphEditorAvailable, false);
  globalThis.fetch = async () => { throw new Error('offline'); };
  await inst._probeGraphEditor();
  assert.equal(inst.graphEditorAvailable, false);
  assert.equal(updates.length, 1);
  globalThis.fetch = realFetch;
}

// ---- Effect picker switches (Aurora-kep2.1) ----

const RAINBOW = { id: 'rainbow', builtin: false, title: 'Rainbow', description: null };
const ON_VIDEO = { ...VIDEO_STATE, effect: 'builtin.video' };
const ON_RAINBOW = { ...VIDEO_STATE, effect: 'rainbow' };

// A picker switch PUTs /api/effects, holds the pending target while the
// rebuild runs, and fills only once the pipeline runs that id.
{
  let during = null;
  const { inst } = switchScreen({ state: ON_VIDEO });
  Object.assign(inst, { mode: 'video', effects: [RAINBOW], nextState: ON_RAINBOW });
  const calls = stubFetch(() => {
    during = { mode: inst.pendingMode, id: inst.pendingEffectId };
    return { succeeded: true };
  });
  try { await inst._switchMode('custom', 'rainbow'); } finally { globalThis.fetch = realFetch; }
  assert.equal(calls[0].url, '/api/effects');
  assert.equal(calls[0].options.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].options.body), { activeEffectId: 'rainbow' });
  assert.deepEqual(during, { mode: 'custom', id: 'rainbow' }, 'pending names the target while in flight');
  assert.equal(inst.mode, 'custom');
  assert.equal(inst.pendingMode, null);
  assert.equal(inst.pendingEffectId, null);
}

// Saved but the pipeline fell back to the built-in: the fill stays put.
{
  stubFetch(() => ({ succeeded: true }));
  const { inst } = switchScreen({ state: ON_VIDEO });
  Object.assign(inst, { mode: 'video', effects: [RAINBOW], nextState: ON_VIDEO });
  try { await inst._switchMode('custom', 'rainbow'); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.mode, 'video', 'not confirmed: no fill');
  assert.equal(inst.pendingMode, null);
}

// A rejected pick of an effect that is gone says so.
{
  stubFetch(() => ({ succeeded: false, error: 'unknown_effect' }));
  const { inst } = switchScreen({ state: ON_VIDEO });
  Object.assign(inst, { mode: 'video', effects: [RAINBOW] });
  try { await inst._switchMode('custom', 'rainbow'); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.toggleError, 'Rainbow no longer exists.');
}

// A rejection names the effect by title, remembers its id, and clears once
// that effect runs (a retry or an outside apply).
{
  stubFetch(() => ({ succeeded: false }));
  const { inst } = switchScreen({ state: ON_VIDEO });
  Object.assign(inst, { mode: 'video', effects: [RAINBOW] });
  try { await inst._switchMode('custom', 'rainbow'); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.toggleError, "Rainbow didn't start.", 'the panel line for a request that never ran');
  assert.equal(inst.toggleErrorMode, 'custom');
  assert.equal(inst.toggleErrorEffectId, 'rainbow');

  stubFetch(() => ({ succeeded: true }));
  inst.nextState = ON_RAINBOW;
  try { await inst._switchMode('custom', 'rainbow'); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.toggleError, null, 'confirmed retry clears it');
  assert.equal(inst.toggleErrorEffectId, null);
}

// Picking what already runs is a no-op; during a light test it is a real switch.
{
  const calls = stubFetch(() => ({ succeeded: true }));
  const { inst } = switchScreen({ state: ON_RAINBOW });
  Object.assign(inst, { mode: 'custom', effects: [RAINBOW] });
  try {
    await inst._switchMode('custom', 'rainbow');
    assert.equal(calls.length, 0, 'already running');
    inst.pipelineState = { ...ON_RAINBOW, test: { active: true } };
    inst.nextState = ON_RAINBOW;
    await inst._switchMode('custom', 'rainbow');
    assert.equal(calls.length, 1, 'a light test is not the saved effect');
  } finally { globalThis.fetch = realFetch; }
}

// Built-in rows keep the mode switch (device-aware patch) and carry their effect id.
{
  const seen = [];
  const inst = Object.create(DashboardScreen.prototype);
  inst._switchMode = (...args) => { seen.push(args); };
  inst._onEffectPicked('builtin.video');
  inst._onEffectPicked('builtin.audio');
  inst._onEffectPicked('rainbow');
  assert.deepEqual(seen, [['video', 'builtin.video'], ['audio', 'builtin.audio'], ['custom', 'rainbow']]);
}

// The effect panel is patched in place with what runs, never the pick, and with the switch
// state: busy and the target's title while pending, the rejected line once settled.
{
  const calls = [];
  const inst = Object.create(DashboardScreen.prototype);
  Object.assign(inst, {
    hasAudio: true, effects: [RAINBOW], pipelineState: ON_RAINBOW, graphEditorAvailable: true,
    app: { canApprove: false }, toggleError: null, toggleErrorMode: null,
    pendingMode: 'custom', pendingEffectId: 'rainbow',
    effectPanel: { update: (args) => calls.push(args), destroy() {} },
  });
  inst._renderEffectPanel();
  assert.equal(calls[0].busy, true);
  assert.equal(calls[0].pendingTitle, 'Rainbow');
  assert.equal(calls[0].state, ON_RAINBOW);
  assert.equal(calls[0].canEdit, true);
  assert.equal(calls[0].canDelete, false, 'Delete is Admin only');
  inst.pendingMode = null;
  inst.pendingEffectId = null;
  Object.assign(inst, { toggleError: "Rainbow didn't start.", toggleErrorMode: 'custom' });
  inst._renderEffectPanel();
  assert.equal(calls[1].busy, false);
  assert.equal(calls[1].rejected, "Rainbow didn't start.");
  Object.assign(inst, { effects: [...BUILTINS, RAINBOW], pendingMode: 'audio', pendingEffectId: 'builtin.audio' });
  inst._renderEffectPanel();
  assert.equal(calls[2].pendingTitle, 'Music pulse', 'a built-in pick names its effect too');
  assert.equal(calls[2].rejected, null, 'no rejected line while a retry runs');
  Object.assign(inst, { pendingMode: null, pendingEffectId: null, toggleError: "Screen colors didn't start.", toggleErrorMode: 'video' });
  inst._renderEffectPanel();
  assert.equal(calls[3].rejected, "Screen colors didn't start.", 'a built-in rejection is the panel line too');
}

// kep2.18: built-in picks show Switching to <title> while in flight and announce the title.
for (const [id, mode, title, from] of [
  ['builtin.video', 'video', 'Screen colors', { ...AUDIO_STATE, effect: 'builtin.audio' }],
  ['builtin.audio', 'audio', 'Music pulse', ON_VIDEO],
]) {
  const announced = [];
  let during = null;
  const { inst } = switchScreen({ state: from });
  Object.assign(inst, {
    mode: runningToggle(from), nextState: { ...(mode === 'video' ? VIDEO_STATE : AUDIO_STATE), effect: id },
    effectPanel: { announceSwitch: (a) => announced.push(a) },
  });
  stubFetch(() => {
    during = inst.pendingMode && inst._effectLabel(inst.pendingEffectId);
    return { succeeded: true };
  });
  try { await inst._onEffectPicked(id); } finally { globalThis.fetch = realFetch; }
  assert.equal(during, title, 'pending names the effect');
  assert.deepEqual(announced, [{ title, outcome: 'success' }]);
  assert.equal(inst.mode, mode);

  stubFetch(() => ({ succeeded: false }));
  const rejected = switchScreen({ state: from }).inst;
  rejected.mode = runningToggle(from);
  try { await rejected._onEffectPicked(id); } finally { globalThis.fetch = realFetch; }
  assert.equal(rejected.toggleError, `${title} didn't start.`);
  assert.equal(rejected.toggleErrorEffectId, id);
}

// The panel shows even with nothing to list, and there is no separate controls row (kep2.18).
{
  const inst = Object.create(DashboardScreen.prototype);
  Object.assign(inst, {
    hasAudio: true, effects: [], pipelineState: ON_VIDEO, platform: 'windows',
    toggleError: "Screen colors didn't start.", toggleErrorMode: 'video', mode: 'video', pendingMode: null,
    effectPanel: null,
    container: { querySelector: () => { throw new Error('no controls row to render into'); } },
  });
  let rendered = 0;
  inst._renderEffectPanel = () => { rendered++; };
  inst._renderControls();
  assert.equal(rendered, 1);
  assert.ok(!('_renderEditLink' in inst), 'the Dashboard Edit graph link is gone');
}

// A failed host reads its banner sentence through the panel's live region.
{
  const said = [];
  const inst = Object.create(DashboardScreen.prototype);
  Object.assign(inst, {
    hostState: 'running', paused: false, canStop: true, pendingMode: null, pipelineState: ON_VIDEO,
    effectPanel: { announce: (m) => said.push(m) },
    _renderTopBar() {},
  });
  inst._onHeartbeatState({ state: 'failed', errors: [{ message: "Couldn't start Fire: no audio input is set up." }], effect: null });
  assert.deepEqual(said, ["Couldn't start Fire: no audio input is set up."]);
  inst._onHeartbeatState({ state: 'failed', errors: [{ message: "Couldn't start Fire: no audio input is set up." }], effect: null });
  assert.equal(said.length, 1, 'the same failure is announced once');
  inst._onHeartbeatState({ state: 'failed', errors: [{ message: 'again' }], effect: null });
  assert.equal(said.length, 2, 'a new failure on a failed host is announced');
}

// kep2.20: the Dashboard switch path announces the failed host's sentence, once.
{
  const FAILED = { state: 'failed', paused: false, effect: null, errors: [{ source: 'resume', message: 'other' }, { source: 'reload', message: "Couldn't start Candle: no audio input is set up." }] };
  const run = async ({ heartbeatFirst = false, second = false } = {}) => {
    const said = [];
    const { inst } = switchScreen({ state: AUDIO_STATE });
    Object.assign(inst, {
      mode: 'audio', nextState: FAILED, hostState: 'running', paused: false, canStop: true,
      effectPanel: { announce: (m) => said.push(m), announceSwitch: (a) => said.push(a) },
      _renderTopBar() {},
    });
    const origLoad = inst._loadAll;
    if (heartbeatFirst) inst._loadAll = async function () { inst._onHeartbeatState(FAILED); return origLoad.call(this); };
    stubFetch(() => ({ succeeded: true, reloadError: 'boom' }));
    try {
      await inst._switchMode('video', 'builtin.video');
      if (second) await inst._switchMode('video', 'builtin.video');
    } finally { globalThis.fetch = realFetch; }
    inst._onHeartbeatState(FAILED);
    return said;
  };
  const sentence = "Couldn't start Candle: no audio input is set up.";
  assert.deepEqual(await run(), [sentence], 'flow announces the effect row once, heartbeat adds nothing');
  assert.deepEqual(await run({ heartbeatFirst: true }), [sentence], 'heartbeat landing first is not doubled');
  assert.deepEqual(await run({ second: true }), [sentence, sentence], 'a second failure on a failed host is announced');
}

console.log('DashboardScreen pause checks passed.');

// kep2.11: a lost PUT answer whose build failed leaves a failed host: no inline copy beside the banner.
{
  const { inst } = switchScreen({ state: AUDIO_STATE });
  inst.daemonDown = false; inst.effects = [];
  inst.nextState = { state: 'failed', errors: [], paused: false, effect: null };
  globalThis.fetch = async () => { throw new Error('lost'); };
  try { await inst._switchMode('custom', 'agent-one'); } finally { globalThis.fetch = realFetch; }
  assert.equal(inst.toggleError, null, 'failed host shows only the banner');
}

// kep2.11: an unknown_effect error clears once another client switches the running effect.
{
  const { inst } = switchScreen({ state: { ...VIDEO_STATE, effect: 'builtin.video' } });
  inst.effects = [];
  stubFetch(() => ({ succeeded: false, error: 'unknown_effect' }));
  try { await inst._switchMode('custom', 'gone'); } finally { globalThis.fetch = realFetch; }
  assert.match(inst.toggleError, /no longer exists/);
  inst.nextState = { ...AUDIO_STATE, effect: 'builtin.audio' };
  await inst._loadAll();
  assert.equal(inst.toggleError, null, 'a switch from elsewhere clears it');
}
