// CaptureSource contracts (Aurora-kea): mode helpers, flag fallbacks, and
// the saves both screens send. No DOM -- run with `node CaptureSource.test.mjs`.
import assert from 'node:assert/strict';
import {
  audioDevicesUrlFrom, devicePatch, effectiveFlags, flagsForMode, flagsMatchMode, isIdle, isInputFreeEffect,
  isApplyConfirmed, isModeConfigValid, keepCustomEffect,
  customEffectRunning, isEffectSwitchConfirmed,
  isSwitchConfirmed, isSwitchErrorStale, loadEffects, loadPipelineState,
  lightTestActive, modeFromConfig, modeFromFlags, modeSwitchPatch, putEffectSwitch, runningFlags, runningToggle,
} from './CaptureSource.js';

const VIDEO = { usesVideoInput: true, usesAudioInput: false, samplesZones: true };
const AUDIO = { usesVideoInput: false, usesAudioInput: true, samplesZones: false };
const BOTH = { usesVideoInput: true, usesAudioInput: true, samplesZones: true };
const NONE = { usesVideoInput: false, usesAudioInput: false, samplesZones: false };

// modeFromConfig: Pipeline::build's rule -- audio only with no video input.
assert.equal(modeFromConfig({ activeInputName: '', activeAudioInputName: 'linux-audio' }), 'audio');
assert.equal(modeFromConfig({ activeInputName: 'linux', activeAudioInputName: 'linux-audio' }), 'video');
// The effect id decides when it names a built-in, even with both inputs saved.
assert.equal(modeFromConfig({ activeEffectId: 'builtin.audio', activeInputName: 'linux', activeAudioInputName: 'linux-audio' }), 'audio');
assert.equal(modeFromConfig({ activeEffectId: 'builtin.video', activeInputName: '', activeAudioInputName: 'linux-audio' }), 'video');
assert.equal(modeFromConfig({}), 'video');
assert.equal(modeFromConfig(undefined), 'video');

// isModeConfigValid checks the input of the config's own mode.
assert.equal(isModeConfigValid({ activeInputName: 'linux' }, ['linux'], []), true);
assert.equal(isModeConfigValid({ activeInputName: 'gone' }, ['linux'], []), false);
assert.equal(isModeConfigValid({ activeAudioInputName: 'a' }, ['linux'], ['a']), true);
assert.equal(isModeConfigValid({}, ['linux'], ['a']), false);

// A source-less active effect needs no input, in any host state.
{
  const effects = [
    { id: 'glow', inputs: { video: false, audio: false } },
    { id: 'capture', inputs: { video: true, audio: false } },
    { id: 'broken', inputs: null },
  ];
  assert.equal(isInputFreeEffect({ activeEffectId: 'glow' }, effects), true);
  assert.equal(isInputFreeEffect({ activeEffectId: 'capture' }, effects), false);
  assert.equal(isInputFreeEffect({ activeEffectId: 'broken' }, effects), false);
  assert.equal(isInputFreeEffect({ activeEffectId: 'gone' }, effects), false);
  assert.equal(isInputFreeEffect({}, effects), false);
  assert.equal(isModeConfigValid({ activeEffectId: 'glow' }, ['linux'], [], effects), true);
  assert.equal(isModeConfigValid({ activeEffectId: 'capture' }, ['linux'], [], effects), false);
  assert.equal(isModeConfigValid({ activeEffectId: 'broken' }, ['linux'], [], effects), false);
  // A failed effect list falls back to needing an input.
  assert.equal(isModeConfigValid({ activeEffectId: 'glow' }, ['linux'], []), false);
}

assert.deepEqual(flagsForMode('video'), VIDEO);
assert.deepEqual(flagsForMode('audio'), AUDIO);

// modeFromFlags reads the running flags as a toggle choice.
assert.equal(modeFromFlags(VIDEO), 'video');
assert.equal(modeFromFlags(AUDIO), 'audio');
assert.equal(modeFromFlags(BOTH), 'video');
assert.equal(modeFromFlags(NONE), 'video');

// flagsMatchMode compares the input pair only: zone sampling follows the
// effect, so video running without it still matches video.
assert.equal(flagsMatchMode(VIDEO, 'video'), true);
assert.equal(flagsMatchMode(AUDIO, 'audio'), true);
assert.equal(flagsMatchMode(VIDEO, 'audio'), false);
assert.equal(flagsMatchMode(AUDIO, 'video'), false);
assert.equal(flagsMatchMode({ usesVideoInput: true, usesAudioInput: false, samplesZones: false }, 'video'), true);
assert.equal(flagsMatchMode(null, 'video'), false);
assert.equal(flagsMatchMode(null, 'audio'), false);

// isSwitchConfirmed (Aurora-axoz): fill moves only on succeeded + no
// reloadError + agreeing /api/state flags.
assert.equal(isSwitchConfirmed({ succeeded: true }, AUDIO, 'audio'), true);
assert.equal(isSwitchConfirmed({ succeeded: true }, VIDEO, 'video'), true);
// Save or reload failure never confirms.
assert.equal(isSwitchConfirmed({ succeeded: false }, AUDIO, 'audio'), false);
assert.equal(isSwitchConfirmed({ succeeded: true, reloadError: 'boom' }, AUDIO, 'audio'), false);
assert.equal(isSwitchConfirmed(null, AUDIO, 'audio'), false);
// Flags disagreeing means no confirm even with a clean save...
assert.equal(isSwitchConfirmed({ succeeded: true }, VIDEO, 'audio'), false);
// ...which is exactly the paused case: reload() succeeds without building,
// so the pre-pause flags still report the old pipeline.
assert.equal(isSwitchConfirmed({ succeeded: true }, { paused: true, ...VIDEO }, 'audio'), false);
assert.equal(isSwitchConfirmed({ succeeded: true }, { paused: true, ...VIDEO }, 'video'), true);
// Unreachable state never confirms.
assert.equal(isSwitchConfirmed({ succeeded: true }, null, 'audio'), false);

// runningFlags reads only literal true; junk or missing reads false.
assert.deepEqual(runningFlags(null), NONE);
assert.deepEqual(runningFlags({ usesVideoInput: 'yes', usesAudioInput: 1 }), NONE);
assert.deepEqual(runningFlags({ ...BOTH, paused: true }), BOTH);
assert.equal(isIdle(NONE), true);
assert.equal(isIdle(AUDIO), false);

// effectiveFlags: what runs wins over config...
assert.deepEqual(effectiveFlags(VIDEO, { activeAudioInputName: 'a' }), VIDEO);
// ...so a failed switch to audio still shows the video that runs.
assert.deepEqual(effectiveFlags({ ...VIDEO, paused: false }, { activeInputName: '', activeAudioInputName: 'a' }), VIDEO);
// Both true is valid, not collapsed to one.
assert.deepEqual(effectiveFlags(BOTH, {}), BOTH);
// Nothing running falls back to the saved mode; a fresh install is video.
assert.deepEqual(effectiveFlags(NONE, { activeAudioInputName: 'a' }), AUDIO);
assert.deepEqual(effectiveFlags(NONE, {}), VIDEO);
// A failed effect switch shows the pick's inputs, even none (Aurora-kep2.4).
assert.deepEqual(
  effectiveFlags({ ...NONE, state: 'failed', graphInputs: { video: false, audio: true } }, { activeInputName: 'v' }),
  { usesVideoInput: false, usesAudioInput: true, samplesZones: false });
assert.deepEqual(
  effectiveFlags({ ...NONE, state: 'failed', graphInputs: { video: false, audio: false } }, {}),
  { usesVideoInput: false, usesAudioInput: false, samplesZones: false });
assert.deepEqual(effectiveFlags(null, {}), VIDEO);

assert.equal(audioDevicesUrlFrom({ audioDevicesUrl: '/api/linux/audio-sinks' }), '/api/linux/audio-sinks');
assert.equal(audioDevicesUrlFrom({ audioDevicesUrl: null }), null);
assert.equal(audioDevicesUrlFrom({ audioDevicesUrl: '' }), null);
assert.equal(audioDevicesUrlFrom(null), null);

// devicePatch saves the device of each running input.
const devices = { selectedMonitorName: 'DP-1', sinkName: ' sink-a ' };
assert.deepEqual(devicePatch(VIDEO, devices), { activeMonitorName: 'DP-1' });
assert.deepEqual(devicePatch(AUDIO, devices), { audioTargetSinkName: 'sink-a' });
assert.deepEqual(devicePatch(BOTH, devices), { activeMonitorName: 'DP-1', audioTargetSinkName: 'sink-a' });

// modeSwitchPatch: the mode's input plus its device.
const ctx = {
  inputs: ['dummy', 'linux'], audioInputs: ['linux-audio'],
  currentActiveInputName: '', currentActiveAudioInputName: '',
  monitors: [], selectedMonitorName: 'DP-1', sinkName: ' sink-a ',
};
assert.deepEqual(modeSwitchPatch('video', ctx), { activeEffectId: 'builtin.video', activeInputName: 'linux' });
assert.deepEqual(modeSwitchPatch('video', { ...ctx, monitors: [{ name: 'DP-1' }] }), { activeEffectId: 'builtin.video', activeInputName: 'linux', activeMonitorName: 'DP-1' });
assert.deepEqual(modeSwitchPatch('audio', ctx), { activeEffectId: 'builtin.audio', activeAudioInputName: 'linux-audio', audioTargetSinkName: 'sink-a' });

// keepCustomEffect: a custom effect survives, a built-in or unset one is replaced.
{
  const patch = modeSwitchPatch('video', ctx);
  assert.deepEqual(keepCustomEffect(patch, 'glow'), { activeInputName: 'linux' });
  assert.deepEqual(keepCustomEffect(patch, 'builtin.audio'), patch);
  assert.deepEqual(keepCustomEffect(patch, ''), patch);
}

// isApplyConfirmed: a kept custom effect counts once it runs, a built-in switch
// still needs the built-in running.
{
  const saved = { succeeded: true };
  const kept = { activeInputName: 'linux' };
  const switched = { activeEffectId: 'builtin.video', activeInputName: 'linux' };
  assert.equal(isApplyConfirmed(saved, { effect: 'glow', ...VIDEO }, 'video', kept, 'glow'), true);
  assert.equal(isApplyConfirmed(saved, { effect: null, ...NONE }, 'video', kept, 'glow'), false);
  assert.equal(isApplyConfirmed({ succeeded: true, reloadError: 'x' }, { effect: 'glow', ...VIDEO }, 'video', kept, 'glow'), false);
  assert.equal(isApplyConfirmed(saved, { effect: 'builtin.video', ...VIDEO }, 'video', switched, ''), true);
  assert.equal(isApplyConfirmed(saved, { effect: 'glow', ...VIDEO }, 'video', switched, 'glow'), false);
}

// loadPipelineState: the parsed body, or null on any failure.
{
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.equal(url, '/api/state');
      return { json: async () => ({ paused: false, ...AUDIO }) };
    };
    assert.deepEqual(await loadPipelineState(), { paused: false, ...AUDIO });

    globalThis.fetch = async () => { throw new Error('down'); };
    assert.equal(await loadPipelineState(), null);

    globalThis.fetch = async () => ({ json: async () => null });
    assert.equal(await loadPipelineState(), null);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// A lingering switch error is stale once the pipeline runs the mode it was
// heading to (Aurora-tazx); no state or no remembered mode keeps it.
{
  const videoState = { paused: false, ...VIDEO };
  const audioState = { paused: false, ...AUDIO };
  assert.equal(isSwitchErrorStale(videoState, 'video'), true, 'running the failed target');
  assert.equal(isSwitchErrorStale(audioState, 'video'), false, 'still on the old mode');
  assert.equal(isSwitchErrorStale({ ...audioState, paused: true }, 'video'), false, 'paused on the old mode');
  assert.equal(isSwitchErrorStale({ paused: true, ...VIDEO }, 'video'), true, 'resumed into the failed target');
  assert.equal(isSwitchErrorStale({ ...audioState }, 'audio'), true);
  assert.equal(isSwitchErrorStale(null, 'video'), false, 'no state probe keeps the error');
  assert.equal(isSwitchErrorStale(videoState, null), false, 'no remembered mode keeps the error');
  assert.equal(isSwitchErrorStale({ paused: false, usesVideoInput: false, usesAudioInput: false, samplesZones: false }, 'video'), false, 'idle is not the target');
}

// Effect picker (Aurora-kep2.1, replacing the MCP toggle of Aurora-4xqt.2):
// a custom effect fills the picker only while it runs, a switch confirms
// only once the pipeline runs that id, and a failed one clears when it does.
{
  const onVideo = { effect: 'builtin.video', mcpEffectId: 'agent-one', ...VIDEO };
  const onCustom = { ...onVideo, effect: 'agent-one' };
  assert.equal(customEffectRunning(onVideo), false, 'built-in runs');
  assert.equal(customEffectRunning(onCustom), true);
  assert.equal(customEffectRunning({ ...onVideo, effect: null }), false, 'idle/failed: not filled');
  assert.equal(customEffectRunning({ ...onVideo, effect: '' }), false);
  assert.equal(customEffectRunning(null), false);

  // Video/Audio only confirm once the custom effect has stopped running.
  assert.equal(isSwitchConfirmed({ succeeded: true }, onCustom, 'video'), false);
  assert.equal(isSwitchConfirmed({ succeeded: true }, onVideo, 'video'), true);

  assert.equal(isEffectSwitchConfirmed({ succeeded: true }, onCustom, 'agent-one'), true);
  assert.equal(isEffectSwitchConfirmed({ succeeded: true }, onVideo, 'agent-one'), false, 'fell back to the built-in');
  assert.equal(isEffectSwitchConfirmed({ succeeded: true }, onCustom, 'agent-two'), false, 'another custom runs');
  assert.equal(isEffectSwitchConfirmed({ succeeded: true, reloadError: 'x' }, onCustom, 'agent-one'), false);
  assert.equal(isEffectSwitchConfirmed({ succeeded: false }, onCustom, 'agent-one'), false);

  assert.equal(isSwitchErrorStale(onCustom, 'custom', 'agent-one'), true);
  assert.equal(isSwitchErrorStale(onVideo, 'custom', 'agent-one'), false);
  assert.equal(isSwitchErrorStale(onCustom, 'custom', 'agent-two'), false, 'a different custom runs');
  assert.equal(isSwitchErrorStale(onCustom, 'custom', null), false, 'no remembered id keeps the error');

  // runningToggle: the running effect fills, never the saved config.
  assert.equal(runningToggle(onCustom), 'custom');
  assert.equal(runningToggle(onVideo), 'video', 'MCP saved but built-in runs');
  assert.equal(runningToggle({ ...VIDEO, effect: 'builtin.audio', mcpEffectId: null }), 'audio');
  assert.equal(runningToggle({ ...VIDEO, effect: null }), null, 'nothing running: no fill');
  assert.equal(runningToggle({ ...VIDEO, effect: 'custom.other' }), 'custom', 'any custom fills the picker, MCP or not');
  assert.equal(runningToggle(null), null);
  const testing = { ...VIDEO, effect: 'builtin.video', mcpEffectId: null, test: { active: true, confirmRemainingMs: 90000 } };
  assert.equal(lightTestActive(testing), true);
  assert.equal(runningToggle(testing), 'custom', 'a light test fills the picker, even with no kept effect');
  assert.equal(runningToggle({ ...testing, test: { active: false, confirmRemainingMs: 0 } }), 'video', 'test over: back to the built-in');
  assert.equal(lightTestActive(null), false);

  const realFetch = globalThis.fetch;
  try {
    let seen;
    globalThis.fetch = async (url, init) => { seen = { url, init }; return { json: async () => ({ succeeded: true }) }; };
    assert.deepEqual(await putEffectSwitch('agent-one'), { succeeded: true });
    assert.equal(seen.url, '/api/effects');
    assert.equal(seen.init.method, 'PUT');
    assert.deepEqual(JSON.parse(seen.init.body), { activeEffectId: 'agent-one' });
  } finally {
    globalThis.fetch = realFetch;
  }
}

// The effect list loader.
{
  const EFFECTS = [
    { id: 'builtin.video', builtin: true, title: 'Screen colors', description: 'Matches the screen' },
    { id: 'builtin.audio', builtin: true, title: 'Music', description: null },
    { id: 'rainbow', builtin: false, title: 'Rainbow', description: 'Cycles hues' },
    { id: 'untitled', builtin: false, title: '', description: null },
  ];
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ json: async () => ({ effects: [...EFFECTS, { id: '' }, null] }) });
    assert.deepEqual(await loadEffects(), EFFECTS, 'malformed rows dropped');
    globalThis.fetch = async () => ({ json: async () => ({}) });
    assert.deepEqual(await loadEffects(), []);
    globalThis.fetch = async () => { throw new Error('down'); };
    assert.deepEqual(await loadEffects(), [], 'unreachable: picker hides');
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log('CaptureSource.test.mjs: ok');
