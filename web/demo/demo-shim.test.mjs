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
  const r = testRouter({})( 'GET', '/api/capabilities');
  assert.equal(r.status, 200);
  assert.ok(r.json.outputs.includes('hue'), 'hue output advertised');
  assert.ok(r.json.inputs.length > 0 && r.json.audioInputs.length > 0);
}

// Version answers the footer probe with the CHANGELOG release.
{
  const r = testRouter({})('GET', '/api/version');
  assert.equal(r.status, 200);
  const changelog = readFileSync(new URL('../../CHANGELOG.txt', import.meta.url), 'utf8');
  const top = changelog.match(/^v(\d+\.\d+\.\d+)/m);
  assert.ok(top, 'CHANGELOG top entry is versioned');
  assert.equal(r.json.version, top[1], 'shim version matches CHANGELOG');
}

// Config GET returns the full live-defaulted set incl. interpolation NAME.
{
  const r = testRouter({})('GET', '/api/config');
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
  const r = route2('PUT', '/api/config', JSON.stringify({ audioBounceSmoothTime: 0.1, bogusKey: 1 }));
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
  route('PUT', '/api/config', JSON.stringify({ interpolation: 'Cubic' }));
  assert.equal(store.getConfig().interpolation, 'Cubic');
  route('PUT', '/api/config', JSON.stringify({ interpolation: 2 }));
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
  const get = route('GET', '/api/zones');
  assert.equal(get.json.outputName, 'hue');
  assert.equal(get.json.zones.length, 2);
  assert.ok('everConfigured' in get.json.zones[0], 'zone shape carries everConfigured');

  const put = route('PUT', '/api/zones', JSON.stringify({ zoneId: 0, gamma: 0.5 }));
  assert.deepEqual(put.json, { succeeded: true });
  assert.equal(route('GET', '/api/zones').json.zones[0].gamma, 0.5);
  assert.deepEqual(route('GET', '/api/zones').json.zones[0].uvs,
    ZONES_FIXTURE[0].uvs, 'absent uvs untouched');

  assert.deepEqual(route('PUT', '/api/zones', '{bad').json,
    { succeeded: false, error: 'invalid_json_body' });
  assert.deepEqual(route('PUT', '/api/zones', JSON.stringify({ gamma: 1 })).json,
    { succeeded: false, error: 'zoneId_required' });
  assert.deepEqual(route('PUT', '/api/zones', JSON.stringify({ zoneId: 99 })).json,
    { succeeded: false, error: 'unknown_zone' });
}

// Connection stays configured:true (the NUX gate); persist path works.
{
  const route = testRouter({});
  const get = route('GET', '/api/hue/connection');
  assert.equal(get.json.configured, true);
  assert.ok(!('username' in get.json), 'credentials never leak, backend-style');
  const post = route('POST', '/api/hue/connection', JSON.stringify({ entertainmentConfigurationId: 'x' }));
  assert.deepEqual(post.json, { succeeded: true });
  assert.equal(route('GET', '/api/hue/connection').json.entertainmentConfigurationId, 'x');
}

// Entertainment-configurations is a PUT-for-read returning id+name pairs.
{
  const r = testRouter({})('PUT', '/api/hue/entertainment-configurations', '{}');
  assert.equal(r.json.succeeded, true);
  assert.deepEqual(Object.keys(r.json.configurations[0]).sort(), ['id', 'name']);
}

// Channels map 1:1 onto zones by zoneId for "Zone N (names)" labels.
{
  const r = testRouter({ zones: ZONES_FIXTURE })('GET', '/api/hue/channels');
  assert.equal(r.json.succeeded, true);
  assert.deepEqual(r.json.channels.map((c) => c.channelId), [0, 1]);
  assert.deepEqual(r.json.channels[0].lightNames, ['Demo Light 0']);
}

// String zone ids (the room rig's quadrant names) prettify for labels.
{
  const zones = [{ zoneId: 'front-left', uvs: { min: [0, 0], max: [0.5, 0.5] }, active: true, gamma: 0, everConfigured: true }];
  const r = testRouter({ zones })('GET', '/api/hue/channels');
  assert.deepEqual(r.json.channels, [{ channelId: 'front-left', lightNames: ['Front Left'] }]);
}

// Unknown routes 404 instead of falling through to native fetch shapes.
{
  const r = testRouter({})('GET', '/api/nope');
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
  const seeded = testRouter({ descriptors: [{ key: 'app.mode', description: 'x' }] })('GET', '/api/descriptors');
  assert.deepEqual(seeded.json, { descriptors: [{ key: 'app.mode', description: 'x' }] });
  assert.deepEqual(testRouter({})('GET', '/api/descriptors').json, { descriptors: [] });
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
  }
}

console.log('demo-shim contract tests passed.');
