// CaptureSource contracts (Aurora-kea): mode helpers, flag fallbacks, and
// the saves both screens send. No DOM -- run with `node CaptureSource.test.mjs`.
import assert from 'node:assert/strict';
import {
  audioDevicesUrlFrom, devicePatch, effectiveFlags, flagsForMode, flagsMatchMode, isIdle, isModeConfigValid,
  isMcpSwitchConfirmed, isSwitchConfirmed, isSwitchErrorStale, loadPipelineState, mcpEffectIdFrom, mcpEffectRunning,
  lightTestActive, modeFromConfig, modeFromFlags, modeSwitchPatch, putMcpSwitch, runningFlags, runningToggle,
} from './CaptureSource.js';

const VIDEO = { usesVideoInput: true, usesAudioInput: false, samplesZones: true };
const AUDIO = { usesVideoInput: false, usesAudioInput: true, samplesZones: false };
const BOTH = { usesVideoInput: true, usesAudioInput: true, samplesZones: true };
const NONE = { usesVideoInput: false, usesAudioInput: false, samplesZones: false };

// modeFromConfig: Pipeline::build's rule -- audio only with no video input.
assert.equal(modeFromConfig({ activeInputName: '', activeAudioInputName: 'linux-audio' }), 'audio');
assert.equal(modeFromConfig({ activeInputName: 'linux', activeAudioInputName: 'linux-audio' }), 'video');
assert.equal(modeFromConfig({}), 'video');
assert.equal(modeFromConfig(undefined), 'video');

// isModeConfigValid checks the input of the config's own mode.
assert.equal(isModeConfigValid({ activeInputName: 'linux' }, ['linux'], []), true);
assert.equal(isModeConfigValid({ activeInputName: 'gone' }, ['linux'], []), false);
assert.equal(isModeConfigValid({ activeAudioInputName: 'a' }, ['linux'], ['a']), true);
assert.equal(isModeConfigValid({}, ['linux'], ['a']), false);

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
assert.deepEqual(modeSwitchPatch('audio', ctx), { activeEffectId: 'builtin.audio', activeInputName: '', activeAudioInputName: 'linux-audio', audioTargetSinkName: 'sink-a' });

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

// MCP toggle (Aurora-4xqt.2): hidden until /api/state names an MCP effect
// (fresh config, a non-MCP apply, or after the effect is deleted), shown
// once it does, repointed by a second apply, filled only while it runs.
{
  const fresh = { effect: 'builtin.video', mcpEffectId: null, ...VIDEO };
  assert.equal(mcpEffectIdFrom(fresh), null, 'fresh config: hidden');
  assert.equal(mcpEffectIdFrom({ ...fresh, mcpEffectId: '' }), null, 'empty id: hidden');
  assert.equal(mcpEffectIdFrom({ ...VIDEO }), null, 'old daemon without the field: hidden');
  assert.equal(mcpEffectIdFrom(null), null, 'no state probe: hidden');

  const applied = { effect: 'builtin.video', mcpEffectId: 'agent-one', ...VIDEO };
  assert.equal(mcpEffectIdFrom(applied), 'agent-one', 'after an MCP apply: shown');
  assert.equal(mcpEffectRunning(applied), false, 'saved but another effect runs: not filled');
  assert.equal(mcpEffectIdFrom({ ...applied, mcpEffectId: 'agent-two' }), 'agent-two', 'second apply repoints');
  assert.equal(mcpEffectRunning({ ...applied, effect: 'agent-one' }), true);
  assert.equal(mcpEffectRunning({ ...applied, effect: null }), false, 'idle/failed: not filled');

  // Video/Audio only confirm once the MCP effect has stopped running.
  const onMcp = { ...applied, effect: 'agent-one' };
  assert.equal(isSwitchConfirmed({ succeeded: true }, onMcp, 'video'), false);
  assert.equal(isSwitchConfirmed({ succeeded: true }, applied, 'video'), true);

  assert.equal(isMcpSwitchConfirmed({ succeeded: true }, onMcp), true);
  assert.equal(isMcpSwitchConfirmed({ succeeded: true }, applied), false, 'fell back to the built-in');
  assert.equal(isMcpSwitchConfirmed({ succeeded: true, reloadError: 'x' }, onMcp), false);
  assert.equal(isMcpSwitchConfirmed({ succeeded: false }, onMcp), false);

  assert.equal(isSwitchErrorStale(onMcp, 'mcp'), true);
  assert.equal(isSwitchErrorStale(applied, 'mcp'), false);

  // runningToggle: the running effect fills a toggle, never the saved config.
  assert.equal(runningToggle(onMcp), 'mcp');
  assert.equal(runningToggle(applied), 'video', 'MCP saved but built-in runs');
  assert.equal(runningToggle({ ...VIDEO, effect: 'builtin.audio', mcpEffectId: null }), 'audio');
  assert.equal(runningToggle({ ...VIDEO, effect: null }), null, 'nothing running: no fill');
  assert.equal(runningToggle({ ...VIDEO, effect: 'custom.other' }), null, 'custom non-MCP effect: no fill');
  assert.equal(runningToggle(null), null);
  const testing = { ...VIDEO, effect: 'builtin.video', mcpEffectId: null, test: { active: true, confirmRemainingMs: 90000 } };
  assert.equal(lightTestActive(testing), true);
  assert.equal(runningToggle(testing), 'mcp', 'a light test fills MCP, even with no kept effect');
  assert.equal(runningToggle({ ...testing, test: { active: false, confirmRemainingMs: 0 } }), 'video', 'test over: back to the built-in');
  assert.equal(lightTestActive(null), false);

  const realFetch = globalThis.fetch;
  try {
    let seen;
    globalThis.fetch = async (url, init) => { seen = { url, init }; return { json: async () => ({ succeeded: true }) }; };
    assert.deepEqual(await putMcpSwitch('agent-one'), { succeeded: true });
    assert.equal(seen.url, '/api/effects');
    assert.equal(seen.init.method, 'PUT');
    assert.deepEqual(JSON.parse(seen.init.body), { activeEffectId: 'agent-one' });
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log('CaptureSource.test.mjs: ok');
