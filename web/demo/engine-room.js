// Drives the room's colors from the engine: load a graph, then each frame feed what
// the graph needs, step, and read liveColors in one worker round trip.
import { inputsOfGraph } from './engine-feeds.js';

const MAX_DT = 0.1;

// Engine zone ids are 1..n in array order, the demo's are strings.
export function toEngineZones(zones) {
  return zones.map((z, index) => ({ ...z, zoneId: index + 1, everConfigured: true }));
}

export function frameFromColors(colors, zones) {
  const engineZones = colors?.outputs?.[0]?.zones;
  if (!engineZones) return null;
  const frame = [];
  for (const { id, r, g, b } of engineZones) {
    const zone = zones[id - 1];
    if (zone) frame.push({ zoneId: zone.zoneId, color: { r, g, b } });
  }
  return frame;
}

// readVideo() -> ImageData-like {data, width, height} or null.
// readAudio(dt) -> {samples: Float32Array, sampleRate, channels} or null.
export function createEngineRoom({ client, readVideo, readAudio, onState = () => {} }) {
  let zones = [];
  let inputs = { video: false, audio: false };
  let loadedKey = null;
  let wanted = null; // {key, doc}
  let loading = false;
  let busy = false;
  let started = false;
  let frame = null;
  let lastTime = null;
  let extras = null;

  async function sync() {
    if (loading || !started || !wanted || wanted.key === loadedKey) return;
    loading = true;
    const target = wanted;
    const result = await client.loadLive(target.doc);
    loading = false;
    if (result?.error) {
      onState({ error: result.message ?? result.error });
    } else {
      loadedKey = target.key;
      inputs = target.inputs;
    }
    sync();
  }

  return {
    async start(initialZones) {
      zones = initialZones;
      await client.ready;
      const result = await client.init({ outputs: [{ name: 'hue', zones: toEngineZones(zones) }] });
      if (result?.error) throw new Error(result.message ?? result.error);
      started = true;
      await sync();
      onState({ ready: true });
    },

    // Same document again is a no-op, so repeated PUTs that touch other keys cost nothing.
    setGraph(doc, graphInputs = inputsOfGraph(doc)) {
      const key = JSON.stringify(doc);
      if (wanted?.key === key) return;
      wanted = { key, doc, inputs: graphInputs };
      sync();
    },

    setZones(nextZones) {
      zones = nextZones;
      if (started) client.setZones('hue', toEngineZones(zones));
    },

    // Rides the same batch as the room: {steps() -> [[call, args]], inputs() -> {video, audio},
    // onResults(results, steps)}. The editor's previews use it, so they tick with the room.
    setExtras(next) {
      extras = next;
    },

    // Called every render frame. Skips while a round trip is in flight.
    tick(nowSeconds) {
      const extraSteps = extras?.steps() ?? [];
      if (!started || busy || (loadedKey === null && extraSteps.length === 0)) return;
      const dt = lastTime === null ? 0 : Math.min(MAX_DT, Math.max(0, nowSeconds - lastTime));
      lastTime = nowSeconds;
      const steps = [];
      const extraInputs = extraSteps.length ? extras.inputs() : {};
      if (inputs.video || extraInputs.video) {
        const image = readVideo();
        if (image) steps.push(['feedVideo', [image.data, image.width, image.height]]);
      }
      if (inputs.audio || extraInputs.audio) {
        const block = readAudio(dt);
        if (block) steps.push(['feedAudio', [block.samples, block.sampleRate, block.channels ?? 1]]);
      }
      steps.push(['step', [dt]], ['liveColors', []]);
      const colorsAt = steps.length - 1;
      steps.push(...extraSteps);
      busy = true;
      const snapshotZones = zones;
      client.batch(steps).then((results) => {
        const colors = results[colorsAt];
        if (!colors?.error) frame = frameFromColors(colors, snapshotZones);
        if (extraSteps.length) extras.onResults(results.slice(colorsAt + 1), extraSteps);
      }).finally(() => { busy = false; });
    },

    // The latest frame, in the color-provider contract: [{zoneId, color:{r,g,b} 0..1}] or null.
    frame: () => frame,
  };
}
