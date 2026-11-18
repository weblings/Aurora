// Worker protocol, client, feed selection and the room controller against a fake engine.
// No wasm module needed (CI runs this). Run: node engine-room.test.mjs
import assert from 'node:assert/strict';
import { createEngineHost, ENGINE_CALLS } from './engine-host.js';
import { createEngineClient } from './engine-client.js';
import { inputsOfGraph, BUILTIN_INPUTS } from './engine-feeds.js';
import { createEngineRoom, frameFromColors, toEngineZones } from './engine-room.js';
import { BUILTIN_GRAPHS } from './builtin-graphs.js';

function fakeEngine(log) {
  const engine = {};
  for (const name of ENGINE_CALLS) engine[name] = (...args) => { log.push([name, args]); return { ok: true }; };
  engine.liveColors = (...args) => {
    log.push(['liveColors', args]);
    return { session: 'live', outputs: [{ output: 'hue', zones: [{ id: 2, r: 1, g: 0.5, b: 0 }, { id: 1, r: 0, g: 0, b: 1 }] }] };
  };
  return engine;
}

// A worker in one process: messages are cloned like postMessage, transfers recorded.
function fakeWorker(host, transfers = []) {
  const listeners = { message: [], error: [] };
  const emit = (type, data) => queueMicrotask(() => listeners[type].forEach((fn) => fn({ data, ...data })));
  return {
    addEventListener: (type, fn) => listeners[type].push(fn),
    postMessage(msg, list = []) {
      transfers.push(list);
      emit('message', host(structuredClone(msg)));
    },
    announce: (msg) => emit('message', msg),
    fail: (message) => emit('error', { message }),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// Host: dispatch, batch, unknown call, thrown engine error.
{
  const log = [];
  const engine = fakeEngine(log);
  engine.step = () => { throw new Error('bad'); };
  const handle = createEngineHost(engine);
  assert.deepEqual(handle({ id: 1, call: 'init', args: [{ a: 1 }] }), { id: 1, result: { ok: true } });
  assert.deepEqual(log[0], ['init', [{ a: 1 }]]);
  assert.equal(handle({ id: 2, call: 'rm_rf', args: [] }).result.error, 'unknown_call');
  assert.equal(handle({ id: 3, call: 'step', args: [0.1] }).result.error, 'engine_exception');
  const batch = handle({ id: 4, call: 'batch', args: [[['feedVideo', [1, 2, 3]], ['step', [0]], ['liveColors', []]]] });
  assert.equal(batch.id, 4);
  assert.equal(batch.result.length, 3);
  assert.equal(batch.result[1].error, 'engine_exception');
  assert.equal(batch.result[2].session, 'live');
}

// Client: promises, ready, buffer transfer (single call and inside a batch).
{
  const log = [];
  const transfers = [];
  const worker = fakeWorker(createEngineHost(fakeEngine(log)), transfers);
  const client = createEngineClient(worker);
  worker.announce({ type: 'ready' });
  await client.ready;
  assert.deepEqual(await client.init({ outputs: [] }), { ok: true });
  const rgba = new Uint8ClampedArray(16);
  await client.feedVideo(rgba, 2, 2);
  assert.equal(transfers.at(-1)[0], rgba.buffer, 'frame buffer is transferred, not copied');
  const pcm = new Float32Array(8);
  const results = await client.batch([['feedAudio', [pcm, 48000, 1]], ['step', [0.016]]]);
  assert.equal(results.length, 2);
  assert.equal(transfers.at(-1)[0], pcm.buffer, 'batch buffers are transferred too');
  assert.deepEqual(log.map(([call]) => call), ['init', 'feedVideo', 'feedAudio', 'step']);
  assert.deepEqual(await client.call('nodes'), { ok: true }, 'generic call matches the named one');
}

// Client: a missing module and a crashed worker reject.
{
  const worker = fakeWorker(() => ({}));
  const client = createEngineClient(worker);
  worker.announce({ type: 'fatal', message: 'module missing' });
  await assert.rejects(client.ready, /module missing/);

  const worker2 = fakeWorker(() => new Promise(() => {}));
  const client2 = createEngineClient(worker2);
  const pending = client2.step(0.1);
  worker2.fail('crashed');
  await assert.rejects(pending, /crashed/);
}

// Feed selection: built-ins are fixed, graphs are read by capture node.
{
  assert.deepEqual(inputsOfGraph(BUILTIN_GRAPHS.video), BUILTIN_INPUTS.video);
  assert.deepEqual(inputsOfGraph(BUILTIN_GRAPHS.audio), BUILTIN_INPUTS.audio);
  assert.deepEqual(inputsOfGraph({ nodes: [{ type: 'video.capture' }, { type: 'audio.capture' }] }), { video: true, audio: true });
  assert.deepEqual(inputsOfGraph({ nodes: [{ type: 'color.constant' }] }), { video: false, audio: false });
}

// Zone mapping: engine ids are 1..n in array order and map back by index.
{
  const zones = [{ zoneId: 'a', active: true }, { zoneId: 'b', active: true }];
  assert.deepEqual(toEngineZones(zones).map((z) => z.zoneId), [1, 2]);
  const frame = frameFromColors({ outputs: [{ zones: [{ id: 2, r: 1, g: 0, b: 0 }, { id: 9, r: 0, g: 0, b: 0 }] }] }, zones);
  assert.deepEqual(frame, [{ zoneId: 'b', color: { r: 1, g: 0, b: 0 } }]);
  assert.equal(frameFromColors({ error: 'no_live_graph' }, zones), null);
}

// Room controller: feeds only what the graph needs, one batch per tick, skips while busy.
{
  const log = [];
  const batches = [];
  let videoReads = 0;
  let audioReads = 0;
  const worker = fakeWorker(createEngineHost(fakeEngine(log)));
  const base = createEngineClient(worker);
  const client = { ...base, batch: (steps) => { batches.push(steps.map(([call]) => call)); return base.batch(steps); } };
  const room = createEngineRoom({
    client,
    readVideo: () => { videoReads++; return { data: new Uint8ClampedArray(16), width: 2, height: 2 }; },
    readAudio: () => { audioReads++; return { samples: new Float32Array(4), sampleRate: 48000, channels: 1 }; },
  });
  room.tick(0);
  assert.deepEqual(batches, [], 'no tick before the engine is ready');

  worker.announce({ type: 'ready' });
  await room.start([{ zoneId: 'a' }, { zoneId: 'b' }]);
  assert.deepEqual(log[0][1][0].outputs[0].zones.map((z) => z.zoneId), [1, 2]);
  room.tick(0);
  assert.deepEqual(batches, [], 'no tick until a graph is loaded');

  room.setGraph(BUILTIN_GRAPHS.video, BUILTIN_INPUTS.video);
  await settle();
  room.setGraph(BUILTIN_GRAPHS.video, BUILTIN_INPUTS.video);
  await settle();
  assert.equal(log.filter(([call]) => call === 'loadLive').length, 1, 'same document is not reloaded');

  room.tick(1);
  room.tick(1.016); // in flight: skipped
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0], ['feedVideo', 'step', 'liveColors']);
  await settle();
  assert.deepEqual(room.frame(), [{ zoneId: 'b', color: { r: 1, g: 0.5, b: 0 } }, { zoneId: 'a', color: { r: 0, g: 0, b: 1 } }]);
  assert.equal(audioReads, 0, 'audio is not read for a video graph');

  room.setGraph(BUILTIN_GRAPHS.audio, BUILTIN_INPUTS.audio);
  await settle();
  room.tick(1.032);
  assert.deepEqual(batches[1], ['feedAudio', 'step', 'liveColors']);
  assert.equal(videoReads, 1, 'video is not read for an audio graph');
  await settle();

  room.tick(5);
  assert.ok(log.filter(([call]) => call === 'step').at(-1)[1][0] <= 0.1, 'dt is clamped');
  await settle();

  room.setZones([{ zoneId: 'x' }]);
  assert.equal(log.at(-1)[0], 'setZones');
}

console.log('engine-room tests passed.');
