// Local-only: runs the built-in graphs on the real wasm module in Node. Skips cleanly when
// vendor/engine/ is absent (CI has no module). Run: node engine-real.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { wrapEngine } from '../engine/engine.js';
import { buildGraphDoc } from './demo-tuning.js';
import { DEMO_DEFAULT_CONFIG } from './demo-shim.js';
import { toEngineZones } from './engine-room.js';

// room-rig.js imports three, so the quadrant zones are spelled out here.
const ROOM_ZONE_MAP = [
  { zoneId: 'front-left', uvs: { min: [0, 0], max: [0.5, 0.5] }, active: true, gamma: 0 },
  { zoneId: 'front-right', uvs: { min: [0.5, 0], max: [1, 0.5] }, active: true, gamma: 0 },
  { zoneId: 'back-left', uvs: { min: [0, 0.5], max: [0.5, 1] }, active: true, gamma: 0 },
  { zoneId: 'back-right', uvs: { min: [0.5, 0.5], max: [1, 1] }, active: true, gamma: 0 },
];

const modulePath = new URL('./vendor/engine/aurora-engine.mjs', import.meta.url);
if (!fs.existsSync(modulePath)) {
  console.log('engine-real: no vendor/engine module, skipped.');
  process.exit(0);
}

const { default: createAuroraEngine } = await import(pathToFileURL(modulePath.pathname.replace(/^\/(\w:)/, '$1')).href);
const engine = wrapEngine(await createAuroraEngine());
assert.deepEqual(engine.init({ outputs: [{ name: 'hue', zones: toEngineZones(ROOM_ZONE_MAP) }] }), { ok: true });

// Video: left half red, right half blue, so the zones must differ left to right.
{
  assert.deepEqual(engine.loadLive(buildGraphDoc('video', DEMO_DEFAULT_CONFIG)), { ok: true });
  const w = 32;
  const h = 18;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) rgba.set(x < w / 2 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * w + x) * 4);
  }
  for (let i = 0; i < 5; i++) { engine.feedVideo(rgba, w, h); engine.step(1 / 60); }
  const zones = engine.liveColors().outputs[0].zones;
  assert.ok(zones[0].r > 0.8 && zones[0].b < 0.2, 'front-left is red');
  assert.ok(zones[1].b > 0.8 && zones[1].r < 0.2, 'front-right is blue');
}

// A tuned width still loads and runs.
assert.deepEqual(engine.loadLive(buildGraphDoc('video', { ...DEMO_DEFAULT_CONFIG, subsampleWidth: 8, interpolation: 'Cubic' })), { ok: true });

// Audio: a loud tone lights the room.
{
  assert.deepEqual(engine.loadLive(buildGraphDoc('audio', DEMO_DEFAULT_CONFIG)), { ok: true });
  for (let tick = 0; tick < 60; tick++) {
    const pcm = new Float32Array(800).map((_, i) => 0.6 * Math.sin((2 * Math.PI * 440 * (tick * 800 + i)) / 48000));
    engine.feedAudio(pcm, 48000, 1);
    engine.step(1 / 60);
  }
  const zones = engine.liveColors().outputs[0].zones;
  assert.equal(zones.length, 4);
  assert.ok(zones.some((z) => z.r + z.g + z.b > 0.1), 'audio produces light');
}
console.log('engine-real tests passed.');
