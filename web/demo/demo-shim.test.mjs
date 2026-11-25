// Shim contract tests: the ported Dashboard cannot distinguish these
// responses from the daemon's, so every shape here is asserted field by
// field against the backend routes (see demo-shim.js header). No test
// framework dependency (matches web-processing/*.test.mjs convention) --
// run with `node demo-shim.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEMO_DEFAULT_CONFIG,
  createMemoryStorage,
  createShimStore,
  createRouter,
} from './demo-shim.js';

const ZONES_FIXTURE = [
  { zoneId: 0, uvs: { min: [0, 0], max: [0.5, 0.5] }, active: true, gamma: 0, everConfigured: true },
  { zoneId: 1, uvs: { min: [0.5, 0], max: [1, 0.5] }, active: true, gamma: 0, everConfigured: true },
];

function testRouter(seed) {
  const store = createShimStore(createMemoryStorage(), seed);
  return createRouter(store);
}

// Capabilities answer the "compiled with" contract the boot probe reads.
{
  const r = (await testRouter({})( 'GET', '/api/capabilities'));
  assert.equal(r.status, 200);
  assert.ok(r.json.outputs.includes('hue'), 'hue output advertised');
  assert.ok(r.json.inputs.length > 0 && r.json.audioInputs.length > 0);
}

// Version answers the footer probe with the CHANGELOG release.
{
  const r = (await testRouter({})('GET', '/api/version'));
  assert.equal(r.status, 200);
  const changelog = readFileSync(new URL('../../CHANGELOG.txt', import.meta.url), 'utf8');
  const top = changelog.match(/^v(\d+\.\d+\.\d+)/m);
  assert.ok(top, 'CHANGELOG top entry is versioned');
  assert.equal(r.json.version, top[1], 'shim version matches CHANGELOG');
}

// State answers GET /api/state's shape (Aurora-kea), following the config
// so a mode switch reads back: the Dashboard picks sections from it.
{
  const store = createShimStore(createMemoryStorage(), {});
  const route = createRouter(store);
  assert.deepEqual((await route('GET', '/api/state')).json, {
    paused: false,
    // No Stop button on the static page (Aurora-ifkn.3).
    canStop: false,
    // No MCP clients on the static page: the MCP toggle stays hidden.
    mcpEffectId: null,
    graphInputs: { video: true, audio: false },
    effect: 'builtin.video',
    effectTitle: 'Screen colors',
    effectDescription: 'Follows the colors on your screen.',
    test: { active: false, mode: null, confirmRemainingMs: 0, holder: null },
    usesVideoInput: true,
    usesAudioInput: false,
    samplesZones: true,
    audioDevicesUrl: '/api/linux/audio-sinks',
  });

  (await route('PUT', '/api/config', JSON.stringify({ activeInputName: '', activeAudioInputName: 'linux-audio' })));
  const audio = (await route('GET', '/api/state')).json;
  assert.equal(audio.effect, 'builtin.audio');
  assert.equal(audio.effectTitle, 'Music pulse');
  assert.deepEqual((await route('GET', '/api/effects')).json.effects.map((e) => e.id), ['builtin.video', 'builtin.audio']);
  assert.equal(audio.usesVideoInput, false);
  assert.equal(audio.usesAudioInput, true);
  assert.equal(audio.samplesZones, false);
  assert.deepEqual(audio.graphInputs, { video: false, audio: true });

  // The advertised device route is one the shim answers.
  assert.equal((await route('GET', audio.audioDevicesUrl)).status, 200);
}

// PUT /api/state (Aurora-5ipy.13): {running: bool} flips the in-memory flag,
// answered back as {running}; bad bodies 400 like the backend.
{
  const store = createShimStore(createMemoryStorage(), {});
  const route = createRouter(store);
  assert.equal((await route('GET', '/api/state')).json.paused, false);

  const paused = (await route('PUT', '/api/state', JSON.stringify({ running: false })));
  assert.equal(paused.status, 200);
  assert.deepEqual(paused.json, { succeeded: true, running: false });
  assert.equal((await route('GET', '/api/state')).json.paused, true);

  // Idempotent repeat, then resume.
  assert.deepEqual((await route('PUT', '/api/state', JSON.stringify({ running: false }))).json, { succeeded: true, running: false });
  assert.deepEqual((await route('PUT', '/api/state', JSON.stringify({ running: true }))).json, { succeeded: true, running: true });
  assert.equal((await route('GET', '/api/state')).json.paused, false);

  assert.equal((await route('PUT', '/api/state', 'not-json')).status, 400);
  assert.equal((await route('PUT', '/api/state', JSON.stringify({}))).json.error, 'running_bool_required');
  assert.equal((await route('PUT', '/api/state', JSON.stringify({ running: 'yes' }))).status, 400);

  // Seed-only: a fresh store always resumes, pause never persists.
  const resumed = createShimStore(createMemoryStorage(), {});
  assert.equal(resumed.isPaused(), false);
  assert.equal((await createRouter(createShimStore(createMemoryStorage(), { paused: true }))('GET', '/api/state')).json.paused, true);
}

// Config GET returns the full live-defaulted set incl. interpolation NAME.
{
  const r = (await testRouter({})('GET', '/api/config'));
  assert.equal(r.status, 200);
  assert.equal(r.json.interpolation, 'Area');
  assert.equal(r.json.audioBounceSmoothTime, DEMO_DEFAULT_CONFIG.audioBounceSmoothTime);
  assert.equal(r.json.nuxCompleted, true);
}

// PUT /api/config merges known keys, ignores unknown ones, persists.
{
  const storage = createMemoryStorage();
  const store = createShimStore(storage, {});
  const route = createRouter(store);
  const seen = [];
  const route2 = createRouter(store, { onConfigPatch: (applied) => seen.push(...applied) });
  const r = (await route2('PUT', '/api/config', JSON.stringify({ audioBounceSmoothTime: 0.1, bogusKey: 1 })));
  assert.deepEqual(r.json, { succeeded: true });
  assert.deepEqual(seen, ['audioBounceSmoothTime']);
  assert.equal(store.getConfig().audioBounceSmoothTime, 0.1);
  assert.ok(!('bogusKey' in store.getConfig()), 'unknown keys never enter the store');
  const reloaded = createShimStore(storage, {});
  assert.equal(reloaded.getConfig().audioBounceSmoothTime, 0.1, 'patch persists across store instances');
}

// Interpolation accepts names only; anything else is ignored, backend-style.
{
  const store = createShimStore(createMemoryStorage(), {});
  const route = createRouter(store);
  (await route('PUT', '/api/config', JSON.stringify({ interpolation: 'Cubic' })));
  assert.equal(store.getConfig().interpolation, 'Cubic');
  (await route('PUT', '/api/config', JSON.stringify({ interpolation: 2 })));
  assert.equal(store.getConfig().interpolation, 'Cubic', 'storage int rejected, last name stands');
}

// Corrupt/foreign persisted payloads degrade to defaults, never poison.
{
  const storage = createMemoryStorage();
  storage.setItem('aurora-demo-config', '{not json');
  assert.equal(createShimStore(storage, {}).getConfig().audioBounceSmoothTime,
    DEMO_DEFAULT_CONFIG.audioBounceSmoothTime);
  const throwing = { getItem: () => { throw new Error('private mode'); }, setItem: () => { throw new Error('private mode'); } };
  assert.equal(createShimStore(throwing, {}).getConfig().activeInputName, 'x11');
}

// Zones PATCH applies present fields only; errors mirror ZoneRoutes shapes.
{
  const route = testRouter({ zones: ZONES_FIXTURE });
  const get = (await route('GET', '/api/zones'));
  assert.equal(get.json.outputName, 'hue');
  assert.equal(get.json.zones.length, 2);
  assert.ok('everConfigured' in get.json.zones[0], 'zone shape carries everConfigured');

  const put = (await route('PUT', '/api/zones', JSON.stringify({ zoneId: 0, gamma: 0.5 })));
  assert.deepEqual(put.json, { succeeded: true });
  assert.equal((await route('GET', '/api/zones')).json.zones[0].gamma, 0.5);
  assert.deepEqual((await route('GET', '/api/zones')).json.zones[0].uvs,
    ZONES_FIXTURE[0].uvs, 'absent uvs untouched');

  assert.deepEqual((await route('PUT', '/api/zones', '{bad')).json,
    { succeeded: false, error: 'invalid_json_body' });
  assert.deepEqual((await route('PUT', '/api/zones', JSON.stringify({ gamma: 1 }))).json,
    { succeeded: false, error: 'zoneId_required' });
  assert.deepEqual((await route('PUT', '/api/zones', JSON.stringify({ zoneId: 99 }))).json,
    { succeeded: false, error: 'unknown_zone' });
}

// Connection stays configured:true (the NUX gate); persist path works.
{
  const route = testRouter({});
  const get = (await route('GET', '/api/hue/connection'));
  assert.equal(get.json.configured, true);
  assert.ok(!('username' in get.json), 'credentials never leak, backend-style');
  const post = (await route('POST', '/api/hue/connection', JSON.stringify({ entertainmentConfigurationId: 'x' })));
  assert.deepEqual(post.json, { succeeded: true });
  assert.equal((await route('GET', '/api/hue/connection')).json.entertainmentConfigurationId, 'x');
}

// Entertainment-configurations is a PUT-for-read returning id+name pairs.
{
  const r = (await testRouter({})('PUT', '/api/hue/entertainment-configurations', '{}'));
  assert.equal(r.json.succeeded, true);
  assert.deepEqual(Object.keys(r.json.configurations[0]).sort(), ['id', 'name']);
}

// Channels map 1:1 onto zones by zoneId for "Zone N (names)" labels.
{
  const r = (await testRouter({ zones: ZONES_FIXTURE })('GET', '/api/hue/channels'));
  assert.equal(r.json.succeeded, true);
  assert.deepEqual(r.json.channels.map((c) => c.channelId), [0, 1]);
  assert.deepEqual(r.json.channels[0].lightNames, ['Demo Light 0']);
}

// Output-neutral labels route Zone Mapping reads (Aurora-a0r).
{
  const r = (await testRouter({ zones: ZONES_FIXTURE })('GET', '/api/zones/labels'));
  assert.equal(r.json.succeeded, true);
  assert.deepEqual(r.json.labels.map((l) => l.zoneId), [0, 1]);
  assert.deepEqual(r.json.labels[0].names, ['Demo Light 0']);
}

// String zone ids (the room rig's quadrant names) prettify for labels.
{
  const zones = [{ zoneId: 'front-left', uvs: { min: [0, 0], max: [0.5, 0.5] }, active: true, gamma: 0, everConfigured: true }];
  const r = (await testRouter({ zones })('GET', '/api/hue/channels'));
  assert.deepEqual(r.json.channels, [{ channelId: 'front-left', lightNames: ['Front Left'] }]);
}

// Audio sinks answer the DeviceField dropdown probe with name+description
// pairs (Aurora-67y); copies isolate HTTP readers like the monitors route.
{
  const r = (await testRouter({})('GET', '/api/linux/audio-sinks'));
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.sinks) && r.json.sinks.length > 0, 'demo ships at least one sink');
  for (const s of r.json.sinks) {
    assert.equal(typeof s.name, 'string', 'sink carries a node name');
    assert.equal(typeof s.description, 'string', 'sink carries a description');
  }
  r.json.sinks[0].name = 'mutated';
  assert.notEqual((await testRouter({})('GET', '/api/linux/audio-sinks')).json.sinks[0].name, 'mutated', 'responses are copies');
}

// Audio status mirrors the native {followingDefault, sinkName} shape from
// the demo config (Aurora-ifkn.7); unset target means following default.
{
  const r = (await testRouter({})('GET', '/api/linux/audio-status'));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { followingDefault: true, sinkName: '' });
}

// Discovery finds no bridge behind a static page (Aurora-ifkn.7), so
// OutputConnectScreen takes its entry-form fallthrough, never a dead end.
{
  const r = (await testRouter({})('GET', '/api/hue/discover'));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { succeeded: true, bridges: [] });
}

// Unknown routes 404 instead of falling through to native fetch shapes.
{
  const r = (await testRouter({})('GET', '/api/nope'));
  assert.equal(r.status, 404);
  assert.equal(r.json.succeeded, false);
}

// liveZones exposes the owned array for the scene's per-frame reads;
// setZones preserves its identity so holders never go stale.
{
  const store = createShimStore(createMemoryStorage(), { zones: ZONES_FIXTURE });
  const live = store.liveZones();
  assert.equal(live.length, 2);
  store.putZone({ zoneId: 0, gamma: 0.5 });
  assert.equal(live[0].gamma, 0.5, 'PUT visible through live ref');
  store.setZones([{ zoneId: 5, uvs: { min: [0, 0], max: [1, 1] }, active: true, gamma: 0, everConfigured: true }]);
  assert.ok(store.liveZones() === live, 'reseed preserves array identity');
  assert.equal(live.length, 1);
  const snap = store.getZones().zones;
  snap[0].gamma = 9;
  assert.equal(live[0].gamma, 0, 'getZones copies isolate HTTP readers');
}

// Descriptors serve the seeded copy table; empty seed degrades to [].
{
  const seeded = (await testRouter({ descriptors: [{ key: 'app.mode', description: 'x' }] })('GET', '/api/descriptors'));
  assert.deepEqual(seeded.json, { descriptors: [{ key: 'app.mode', description: 'x' }] });
  assert.deepEqual((await testRouter({})('GET', '/api/descriptors')).json, { descriptors: [] });
}

// Every tooltip key the ported Dashboard can request exists in the generated
// fixture -- the conformance tripwire against copy drift. Slider keys derive
// by TuningSliderGroup's own rule (audio* camelCase -> audio.lowerFirst,
// else video.*); explicit keys are read as literals.
{
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const vendor = join(dirname(fileURLToPath(import.meta.url)), 'vendor', 'webui');
  const sources = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) sources.push(readFileSync(full, 'utf8'));
    }
  };
  walk(vendor);
  const text = sources.join('\n');
  const requested = new Set();
  // Dotted tooltip keys only: bare words ('video', configKey camelCase) are
  // mode names and struct fields, not descriptor lookups.
  for (const [, key] of text.matchAll(/['"]((?:audio|video|zones|input|output|app)\.[A-Za-z.]+)['"]/g)) {
    requested.add(key);
  }
  // Node type names ('audio.drift') share the dotted shape but aren't lookups.
  const { demoNodes } = await import('./demo-graph.js');
  for (const { type } of demoNodes().nodes) requested.delete(type);
  // Slider configKeys (first element of each def array) map by the group rule.
  for (const [, configKey] of text.matchAll(/\['(audio[A-Za-z]+|transitionSmoothing|refreshRate|subsampleWidth)'/g)) {
    requested.add(configKey.startsWith('audio')
      ? `audio.${configKey.charAt(5).toLowerCase()}${configKey.slice(6)}`
      : `video.${configKey}`);
  }
  const fixture = JSON.parse(readFileSync(join(vendor, 'descriptors.json'), 'utf8'));
  const have = new Set(fixture.descriptors.map((d) => d.key));
  const missing = [...requested].filter((k) => !have.has(k));
  assert.deepEqual(missing, [], `fixture lacks requested keys: ${missing.join(', ')}`);
  for (const d of fixture.descriptors) {
    assert.ok(d.key && d.description, `malformed entry: ${JSON.stringify(d)}`);
    assert.ok(d.kind, `kindless entry (backend always emits kind): ${d.key}`);
    // Slider ranges (Aurora-ifkn.6): gen-descriptors.py emits the backend's
    // param schema, so Tuning sliders never see "Couldn't load slider
    // ranges". kind and param stay in lockstep; ranges stay sane.
    // Params ride only on sliders (backend precedent: zones.gamma is slider
    // kind with no param); a param anywhere else is a misshapen regen.
    if (d.param) {
      assert.equal(d.kind, 'slider', `param on non-slider: ${d.key}`);
      const p = d.param;
      assert.equal(typeof p.label, 'string');
      for (const f of ['min', 'max', 'step', 'default']) assert.equal(typeof p[f], 'number', `${d.key}.${f} not a number`);
      assert.equal(typeof p.unit, 'string');
      assert.equal(typeof p.allowsUnset, 'boolean');
      assert.ok(p.min < p.max, `${d.key} range inverted`);
      assert.ok(p.step > 0, `${d.key} step not positive`);
      assert.ok(p.allowsUnset || (p.default >= p.min && p.default <= p.max), `${d.key} default outside range`);
    }
  }
  // Every Tuning slider the demo renders resolves to a ranged param (not
  // just a key): audio* + transitionSmoothing configKeys map to descriptor
  // keys by the same group rule as above (refreshRate/subsampleWidth are
  // dropdowns, ranges N/A).
  const byKey = new Map(fixture.descriptors.map((d) => [d.key, d]));
  const unslid = [];
  for (const [, configKey] of text.matchAll(/\['(audio[A-Za-z]+|transitionSmoothing)'/g)) {
    const key = configKey.startsWith('audio')
      ? `audio.${configKey.charAt(5).toLowerCase()}${configKey.slice(6)}`
      : `video.${configKey}`;
    if (!byKey.get(key)?.param) unslid.push(key);
  }
  assert.deepEqual(unslid, [], `tuning slider without ranges: ${unslid.join(', ')}`);
}

// Tuning's controls (Aurora-id8j.10): the demo's graph + node schema resolve to
// today's fields in both modes, every control bound to a real config key.
{
  const descriptors = JSON.parse(readFileSync(new URL('./vendor/webui/descriptors.json', import.meta.url), 'utf8')).descriptors;
  const { resolveControls } = await import('./vendor/webui/TuningControls.js');
  const route = testRouter({ descriptors });
  const nodeTypes = (await route('GET', '/api/nodes')).json.nodes;
  const video = resolveControls((await route('GET', '/api/graph')).json.graph, nodeTypes);
  assert.deepEqual(video.map((c) => c.configKey), ['subsampleWidth', 'interpolation', 'transitionSmoothing']);
  const audioRoute = testRouter({ descriptors, config: { activeInputName: '', activeAudioInputName: 'linux-audio' } });
  const audioGraph = (await audioRoute('GET', '/api/graph')).json.graph;
  assert.equal(audioGraph.tickHz, 60);
  const audio = resolveControls(audioGraph, nodeTypes);
  assert.equal(audio.length, 11);
  for (const c of [...video, ...audio]) assert.ok(c.configKey in DEMO_DEFAULT_CONFIG, c.configKey);
  assert.equal(audio.find((c) => c.configKey === 'audioFixedAnchorHue').allowsUnset, true);
  // The demo runs built-ins only, so Tuning keeps committing through /api/config.
  assert.equal((await route('GET', '/api/effects')).json.effect, 'builtin.video');
  assert.equal((await audioRoute('GET', '/api/effects')).json.effect, 'builtin.audio');
}

// Picker layout routes (Aurora-kep2.5): hide, move and rename answer like the backend.
{
  const route = testRouter({});
  const ids = async () => (await route('GET', '/api/effects')).json.effects.map((e) => e.id);
  assert.deepEqual((await route('GET', '/api/effects')).json.effects.map((e) => [e.hidden, e.order]), [[false, 0], [false, 1]]);
  assert.equal((await route('POST', '/api/effects/builtin.audio/move', JSON.stringify({ direction: 'up' }))).json.moved, true);
  assert.deepEqual(await ids(), ['builtin.audio', 'builtin.video']);
  assert.equal((await route('POST', '/api/effects/builtin.audio/move', JSON.stringify({ direction: 'up' }))).json.moved, false);
  assert.equal((await route('POST', '/api/effects/builtin.audio/move', JSON.stringify({ direction: 'left' }))).status, 400);
  assert.equal((await route('PUT', '/api/effects/builtin.video/hidden', JSON.stringify({ hidden: true }))).json.hidden, true);
  assert.equal((await route('GET', '/api/effects')).json.effects[1].hidden, true);
  assert.equal((await route('PUT', '/api/effects/builtin.video/hidden', JSON.stringify({ hidden: false }))).status, 200);
  assert.equal((await route('PUT', '/api/effects/nope/hidden', JSON.stringify({ hidden: true }))).status, 404);
  assert.equal((await route('PUT', '/api/effects/builtin.video/title', JSON.stringify({ title: 'X' }))).json.error, 'builtin_effect');
  assert.equal((await route('PUT', '/api/effects/nope/title', JSON.stringify({ title: 'X' }))).status, 404);
  assert.equal((await route('PUT', '/api/effects/nope/title', JSON.stringify({ title: ' ' }))).json.error, 'invalid_title');
}

// Custom effects (Aurora-51nv.9): listed after the built-ins, routes act on them, a fresh store over the same storage keeps them.
{
  const storage = createMemoryStorage();
  const open = () => { const store = createShimStore(storage, {}); return { store, route: createRouter(store) }; };
  const json = (v) => JSON.stringify(v);
  let { store, route } = open();
  const list = async () => (await route('GET', '/api/effects')).json.effects;
  assert.equal(store.effects.putCustom('Bad Id', { title: 'x' }), false);
  assert.equal(store.effects.putCustom('builtin.video', { title: 'x' }), false);
  store.effects.putCustom('aaa', { title: 'First', description: 'one' });
  store.effects.putCustom('bbb', { title: 'Second' });
  assert.deepEqual((await list()).map((e) => [e.id, e.builtin, e.title, e.description, e.order]), [
    ['builtin.video', true, 'Screen colors', 'Follows the colors on your screen.', 0],
    ['builtin.audio', true, 'Music pulse', 'Moves with the sound your computer is playing.', 1],
    ['aaa', false, 'First', 'one', 2],
    ['bbb', false, 'Second', null, 3],
  ]);
  // Move stays inside the group, hidden customs are skipped.
  assert.equal((await route('POST', '/api/effects/aaa/move', json({ direction: 'up' }))).json.moved, false);
  assert.equal((await route('POST', '/api/effects/bbb/move', json({ direction: 'up' }))).json.moved, true);
  assert.deepEqual((await list()).map((e) => e.id), ['builtin.video', 'builtin.audio', 'bbb', 'aaa']);
  store.effects.putCustom('ccc', { title: 'Third' });
  assert.equal((await route('PUT', '/api/effects/aaa/hidden', json({ hidden: true }))).json.hidden, true);
  assert.equal((await route('POST', '/api/effects/ccc/move', json({ direction: 'up' }))).json.moved, true);
  assert.deepEqual((await list()).map((e) => e.id), ['builtin.video', 'builtin.audio', 'ccc', 'bbb', 'aaa']);
  assert.equal((await route('POST', '/api/effects/builtin.audio/move', json({ direction: 'down' }))).json.moved, false);
  const renamed = (await route('PUT', '/api/effects/bbb/title', json({ title: '  Renamed  ' }))).json;
  assert.deepEqual(renamed, { succeeded: true, id: 'bbb', title: 'Renamed' });
  assert.equal((await route('PUT', '/api/effects/bbb/title', json({ title: 'x'.repeat(81) }))).json.error, 'invalid_title');

  // Reload round trip: a fresh store over the same storage.
  ({ store, route } = open());
  assert.deepEqual((await list()).map((e) => [e.id, e.title, e.hidden]), [
    ['builtin.video', 'Screen colors', false], ['builtin.audio', 'Music pulse', false],
    ['ccc', 'Third', false], ['bbb', 'Renamed', false], ['aaa', 'First', true],
  ]);
  assert.equal(store.effects.getCustom('aaa').description, 'one');

  assert.equal((await route('DELETE', '/api/effects/builtin.video')).json.error, 'builtin_effect');
  assert.equal((await route('DELETE', '/api/effects/nope')).status, 404);
  assert.deepEqual((await route('DELETE', '/api/effects/aaa')).json, { succeeded: true, deleted: 'aaa', fellBack: false });
  assert.deepEqual((await list()).map((e) => e.id), ['builtin.video', 'builtin.audio', 'ccc', 'bbb']);
  ({ route } = open());
  assert.deepEqual((await list()).map((e) => e.id), ['builtin.video', 'builtin.audio', 'ccc', 'bbb']);

  // Built-in hidden and order persist too, paused does not.
  await route('PUT', '/api/effects/builtin.video/hidden', json({ hidden: true }));
  await route('PUT', '/api/state', json({ running: false }));
  ({ route } = open());
  assert.equal((await list())[0].hidden, true);
  assert.equal((await route('GET', '/api/state')).json.paused, false);
}

console.log('demo-shim contract tests passed.');

// Pause hook (Aurora-calt): PUT /api/state tells the scene, so lamps freeze
// on pause and resume driving on resume; a rejected body never fires it.
{
  const store = createShimStore(createMemoryStorage(), {});
  const seen = [];
  const route = createRouter(store, { onPausedChanged: (p) => seen.push(p) });
  (await route('PUT', '/api/state', JSON.stringify({ running: false })));
  (await route('PUT', '/api/state', JSON.stringify({ running: true })));
  (await route('PUT', '/api/state', JSON.stringify({ running: 'nope' })));
  assert.deepEqual(seen, [true, false]);
}

// Async router (Aurora-51nv.8): route() hands back a promise, never a bare result.
{
  const pending = testRouter({})('GET', '/api/version');
  assert.ok(pending instanceof Promise, 'route returns a promise');
  assert.deepEqual(await pending, { status: 200, json: { version: '1.2.1' } });
  await assert.doesNotReject(testRouter({})('PUT', '/api/state', '{bad'), 'bad body answers 400, never rejects');
}

// installDemoShim awaits the router before building the Response, and
// exposes the same router for in-page callers that skip fetch.
{
  const calls = [];
  globalThis.window = { fetch: async (input) => { calls.push(input); return 'native'; } };
  const { installDemoShim } = await import('./demo-shim.js');
  const shim = installDemoShim({ storage: createMemoryStorage(), seed: { paused: true } });
  const res = await window.fetch('/api/state?x=1', { method: 'GET' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).paused, true);
  const bad = await window.fetch('/api/nope');
  assert.equal(bad.status, 404);
  assert.equal(await window.fetch('/page.css'), 'native');
  assert.deepEqual(calls, ['/page.css']);
  assert.equal((await shim.route('GET', '/api/version')).json.version, '1.2.1');
  shim.uninstall();
  delete globalThis.window;
}
