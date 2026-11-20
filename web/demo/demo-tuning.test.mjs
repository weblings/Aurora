// Mapping tests for demo-tuning.js (node:assert/strict, no framework --
// run with `node demo-tuning.test.mjs`). Config keys land as engine graph params.
import assert from 'node:assert/strict';
import { NO_OP_KEYS, buildGraphDoc, configToEngine } from './demo-tuning.js';
import { BUILTIN_GRAPHS } from './builtin-graphs.js';
import { DEMO_DEFAULT_CONFIG } from './demo-shim.js';

const cfg = (patch) => ({ ...DEMO_DEFAULT_CONFIG, ...patch });
const node = (doc, id) => doc.nodes.find((n) => n.id === id);

// Every control of both built-ins moves its node param.
{
  const patch = {
    transitionSmoothing: 0.4, subsampleWidth: 32, interpolation: 'Cubic',
    audioBounceSmoothTime: 0.5, audioBrightnessSmoothTime: 0.6, audioDriftBaseRateDegPerSec: 33,
    audioVibrancySaturation: 0.1, audioVibrancyValue: 0.2, audioFixedAnchorHue: 180,
    audioDynamismFloor: 0.7, audioCentroidStrength: 0.8, audioReferenceRms: 0.9,
    audioBrightnessFloor: 0.15, audioCentroidRangeHz: 1000,
  };
  for (const mode of ['video', 'audio']) {
    const doc = buildGraphDoc(mode, cfg(patch));
    for (const c of BUILTIN_GRAPHS[mode].controls) {
      assert.equal(node(doc, c.node).params[c.param], patch[c.config], `${mode} ${c.config}`);
    }
  }
}

// Defaults: unset anchor is null, subsampleWidth 0 keeps the document's width, base untouched.
{
  const audio = buildGraphDoc('audio', cfg({}));
  assert.equal(node(audio, 'drift').params.fixedAnchorHue, null);
  assert.equal(node(audio, 'beat').params.bounceSmoothTime, 0.285);
  const video = buildGraphDoc('video', cfg({}));
  assert.equal(node(video, 'rescale').params.width, BUILTIN_GRAPHS.video.nodes.find((n) => n.id === 'rescale').params.width);
  assert.equal(node(video, 'ease_hue').params.smoothing, 0);
  assert.notEqual(video, BUILTIN_GRAPHS.video, 'a copy, never the shared base');
}

// Mode follows probeState's rule exactly.
{
  assert.equal(configToEngine(cfg({ activeInputName: 'x11', activeAudioInputName: '' })).mode, 'video');
  assert.equal(configToEngine(cfg({ activeInputName: '', activeAudioInputName: 'linux-audio' })).mode, 'audio');
  assert.equal(configToEngine(cfg({ activeInputName: '', activeAudioInputName: '' })).mode, 'video');
  assert.equal(configToEngine(cfg({ activeEffectId: 'builtin.audio' })).mode, 'audio');
}

// The ledger covers exactly the keys with no demo effect, and none that drive a control.
{
  assert.deepEqual(Object.keys(NO_OP_KEYS).sort(), ['activeMonitorName', 'audioTargetSinkName', 'refreshRate']);
  const controlled = new Set(['video', 'audio'].flatMap((m) => BUILTIN_GRAPHS[m].controls.map((c) => c.config)));
  for (const key of Object.keys(NO_OP_KEYS)) assert.ok(!controlled.has(key), `${key} is live, not ledgered`);
}

console.log('demo-tuning mapping tests passed.');
