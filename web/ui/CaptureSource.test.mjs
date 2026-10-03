// CaptureSource contracts (Aurora-kea): mode helpers, flag fallbacks, and
// the saves both screens send. No DOM -- run with `node CaptureSource.test.mjs`.
import assert from 'node:assert/strict';
import {
  audioDevicesUrlFrom, devicePatch, effectiveFlags, flagsForMode, isIdle, isModeConfigValid,
  loadPipelineState, modeFromConfig, modeSwitchPatch, runningFlags,
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
assert.deepEqual(modeSwitchPatch('video', ctx), { activeInputName: 'linux' });
assert.deepEqual(modeSwitchPatch('video', { ...ctx, monitors: [{ name: 'DP-1' }] }), { activeInputName: 'linux', activeMonitorName: 'DP-1' });
assert.deepEqual(modeSwitchPatch('audio', ctx), { activeInputName: '', activeAudioInputName: 'linux-audio', audioTargetSinkName: 'sink-a' });

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

console.log('CaptureSource.test.mjs: ok');
