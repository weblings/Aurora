// Mapping tests for demo-tuning.js (node:assert/strict, no framework --
// run with `node demo-tuning.test.mjs`). Shapes mirror the backend routes:
// interpolation names, probeState's mode rule, Config.hpp live defaults.
import assert from 'node:assert/strict';
import { AUDIO_KEYS, NO_OP_KEYS, configToPipeline } from './demo-tuning.js';
import { DEMO_DEFAULT_CONFIG } from './demo-shim.js';

const cfg = (patch) => ({ ...DEMO_DEFAULT_CONFIG, ...patch });

// All 11 audio keys map 1:1 onto the ported settings shape.
{
  const { audio } = configToPipeline(cfg({}));
  assert.equal(Object.keys(audio).length, 11);
  assert.equal(audio.bounceSmoothTime, 0.285);
  assert.equal(audio.driftBaseRateDegPerSec, 10);
  assert.equal(audio.fixedAnchorHue, undefined, '-1 seed means unset/random');
  const { audio: fixed } = configToPipeline(cfg({ audioFixedAnchorHue: 180 }));
  assert.equal(fixed.fixedAnchorHue, 180);
}

// Smoothing and sample width pass through with the documented fallbacks.
{
  assert.equal(configToPipeline(cfg({})).transitionSmoothing, 0);
  assert.equal(configToPipeline(cfg({ subsampleWidth: 0 })).sampleWidth, null);
  assert.equal(configToPipeline(cfg({ subsampleWidth: 320 })).sampleWidth, 320);
}

// Mode follows probeState's rule exactly.
{
  assert.equal(configToPipeline(cfg({ activeInputName: 'x11', activeAudioInputName: '' })).mode, 'video');
  assert.equal(configToPipeline(cfg({ activeInputName: '', activeAudioInputName: 'linux-audio' })).mode, 'audio');
  assert.equal(configToPipeline(cfg({ activeInputName: '', activeAudioInputName: '' })).mode, 'video');
}

// The ledger covers exactly the keys with no demo effect -- no silent no-ops.
{
  assert.deepEqual(Object.keys(NO_OP_KEYS).sort(),
    ['activeMonitorName', 'audioTargetSinkName', 'interpolation', 'refreshRate']);
  for (const key of AUDIO_KEYS) assert.ok(!(key in NO_OP_KEYS), `${key} is live, not ledgered`);
}

console.log('demo-tuning mapping tests passed.');
