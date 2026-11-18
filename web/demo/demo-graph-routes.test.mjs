// Engine-backed shim routes (Aurora-51nv.10) against a fake engine: statuses, bodies and the
// hooks they call. No wasm module needed. Run: node demo-graph-routes.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMemoryStorage, createShimStore, createRouter } from './demo-shim.js';
import { createDraftStore } from './demo-drafts.js';
import { createLightTest } from './demo-lighttest.js';

const sample = (name) => JSON.parse(readFileSync(new URL(`../graph-editor/src/graph/server-samples/${name}`, import.meta.url), 'utf8'));
const json = (v) => JSON.stringify(v);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const GOOD = { version: 1, title: 'Mine', nodes: [{ id: 'cap', type: 'video.capture', params: {} }, { id: 'z', type: 'zones.sample', params: {} }], edges: [], controls: [{ node: 'z', param: 'output' }] };
const BAD = { version: 1, nodes: [], edges: [], bad: true };

// A fake engine: validate accepts anything without `bad`, reads inputs only when asked to.
function fakeEngine({ withInputs = true } = {}) {
  const log = [];
  const engine = {
    ready: Promise.resolve(),
    nodes: async () => ({ nodes: [{ type: 'video.capture' }], portTypes: [] }),
    validate: async (doc) => {
      log.push(['validate']);
      if (doc.bad) return { valid: false, errors: [{ code: 'node_type_unknown', message: 'x', node: null, port: null, param: null, options: [] }], ...(withInputs ? { inputs: { video: false, audio: false } } : {}) };
      const has = (type) => (doc.nodes ?? []).some((n) => n.type === type);
      return { valid: true, errors: [], ...(withInputs ? { inputs: { video: has('video.capture'), audio: has('audio.capture') } } : {}) };
    },
    openPreview: async (...args) => { log.push(['openPreview', ...args]); return { ok: true }; },
    reloadPreview: async (...args) => { log.push(['reloadPreview', args[0]]); return args[1].bad ? { error: 'draft_invalid', message: 'broken' } : { ok: true }; },
    closePreview: async (session) => { log.push(['closePreview', session]); return { ok: true }; },
  };
  return { engine, log };
}

function setup(options = {}) {
  const { engine, log } = fakeEngine(options);
  const calls = [];
  const hooks = {
    engine,
    onActiveGraphChanged: () => calls.push('active'),
    onTestGraph: (doc, inputs) => { calls.push(['test', inputs]); return options.refuseTest ?? ''; },
    onTestEnd: () => calls.push('testEnd'),
  };
  const store = createShimStore(createMemoryStorage(), {});
  const route = createRouter(store, hooks);
  return { store, route, calls, log, hooks };
}

async function putDraft(route, session, graph) {
  return route('PUT', `/api/graph/drafts/${session}`, json({ graph }));
}

// Node catalog: the engine's own list, the static one without an engine.
{
  const { route } = setup();
  assert.deepEqual((await route('GET', '/api/nodes')).json, { nodes: [{ type: 'video.capture' }], portTypes: [] });
  const bare = createRouter(createShimStore(createMemoryStorage(), {}));
  assert.ok((await bare('GET', '/api/nodes')).json.nodes.length > 1);
}

// Effect documents and the active effect.
{
  const { route, store, calls } = setup();
  const video = (await route('GET', '/api/effects/builtin.video')).json;
  assert.equal(video.id, 'builtin.video');
  assert.equal(video.builtin, true);
  assert.equal(video.graph.version, 1);
  assert.equal((await route('GET', '/api/effects/builtin.audio')).json.graph.tickHz, 60);
  assert.deepEqual(await route('GET', '/api/effects/nope'), { status: 404, json: { error: 'unknown_effect' } });
  store.effects.putCustom('mine', GOOD);
  const mine = (await route('GET', '/api/effects/mine')).json;
  assert.deepEqual(mine, { id: 'mine', builtin: false, graph: GOOD });

  // PUT /api/effects switches the running effect for the Dashboard and the room.
  assert.equal((await route('PUT', '/api/effects', 'nope')).status, 400);
  assert.deepEqual((await route('PUT', '/api/effects', json({ activeEffectId: 'ghost' }))).json, { succeeded: false, error: 'unknown_effect' });
  const toAudio = await route('PUT', '/api/effects', json({ activeEffectId: 'builtin.audio' }));
  assert.deepEqual(toAudio.json, { succeeded: true, activeEffectId: 'builtin.audio', effect: 'builtin.audio', requestedEffect: 'builtin.audio' });
  assert.equal((await route('GET', '/api/state')).json.effect, 'builtin.audio');
  assert.equal((await route('GET', '/api/effects')).json.effect, 'builtin.audio');
  assert.equal((await route('GET', '/api/graph')).json.graph.tickHz, 60);
  await route('PUT', '/api/effects', json({ activeEffectId: 'mine' }));
  const state = (await route('GET', '/api/state')).json;
  assert.deepEqual([state.effect, state.effectTitle, state.usesVideoInput, state.usesAudioInput, state.samplesZones], ['mine', 'Mine', true, false, true]);
  assert.deepEqual(state.graphInputs, { video: true, audio: false });
  assert.deepEqual((await route('GET', '/api/graph')).json.graph, GOOD);
  const listed = (await route('GET', '/api/effects')).json;
  assert.equal(listed.activeEffectId, 'mine');
  assert.deepEqual(listed.effects.map((e) => e.inputs), [{ video: true, audio: false }, { video: false, audio: true }, { video: true, audio: false }]);
  // PUT /api/config keeps the same key, and an empty id falls back to the mode's built-in.
  await route('PUT', '/api/effects', json({ activeEffectId: '' }));
  assert.equal((await route('GET', '/api/state')).json.effect, 'builtin.video');
  assert.equal(calls.filter((c) => c === 'active').length, 3);
  // Deleting the running custom effect falls back.
  await route('PUT', '/api/effects', json({ activeEffectId: 'mine' }));
  const deleted = (await route('DELETE', '/api/effects/mine')).json;
  assert.deepEqual(deleted, { succeeded: true, deleted: 'mine', fellBack: true });
  assert.equal((await route('GET', '/api/state')).json.effect, 'builtin.video');
}

// Drafts: the server's body, the same refusals.
{
  const { route } = setup();
  assert.deepEqual((await putDraft(route, 'tab-1', GOOD)).json, { ...sample('validate-ok.json'), succeeded: true, session: 'tab-1' });
  const refused = await putDraft(route, 'tab-1', BAD);
  assert.equal(refused.status, 200);
  assert.equal(refused.json.valid, false);
  assert.deepEqual(Object.keys(refused.json.errors[0]).sort(), Object.keys(sample('validate-errors.json').errors[0]).sort());
  assert.deepEqual((await putDraft(route, 'bad session!', GOOD)).json, { succeeded: false, error: 'invalid_session' });
  assert.equal((await putDraft(route, 'x'.repeat(65), GOOD)).status, 400);
  assert.deepEqual((await route('PUT', '/api/graph/drafts/s', json({ nope: 1 }))).json, { succeeded: false, error: 'invalid_body' });
  assert.equal((await route('PUT', '/api/graph/drafts/s', '{not json')).status, 400);
  assert.equal((await route('PUT', '/api/graph/drafts/s', 'x'.repeat(256 * 1024 + 1))).status, 413);
  for (let i = 0; i < 15; i++) await putDraft(route, `many-${i}`, GOOD);
  const full = await putDraft(route, 'one-too-many', GOOD);
  assert.deepEqual([full.status, full.json.error], [429, 'too_many_drafts']);
  assert.equal((await putDraft(route, 'tab-1', GOOD)).status, 200);
}

// Save and apply write a custom effect with its inputs, apply also makes it run.
{
  const { route, store, calls } = setup();
  await putDraft(route, 'tab', GOOD);
  assert.equal((await route('POST', '/api/graph/save', 'nope')).status, 400);
  assert.equal((await route('POST', '/api/graph/save', json({ session: 'tab' }))).json.error, 'invalid_body');
  assert.equal((await route('POST', '/api/graph/save', json({ session: 'a b', id: 'x' }))).json.error, 'invalid_session');
  assert.equal((await route('POST', '/api/graph/save', json({ session: 'tab', id: 'Bad Id' }))).json.error, 'invalid_effect_id');
  assert.equal((await route('POST', '/api/graph/save', json({ session: 'gone', id: 'mine' }))).status, 404);
  await putDraft(route, 'broken', BAD);
  const invalid = await route('POST', '/api/graph/save', json({ session: 'broken', id: 'mine' }));
  assert.deepEqual([invalid.status, invalid.json.error, invalid.json.valid, invalid.json.succeeded], [422, 'invalid_graph', false, false]);

  const saved = await route('POST', '/api/graph/save', json({ session: 'tab', id: 'mine' }));
  assert.deepEqual(saved.json, { succeeded: true, id: 'mine', activeEffectId: '', effect: 'builtin.video', requestedEffect: 'builtin.video' });
  assert.equal(store.effects.isCustom('mine'), true);
  assert.deepEqual(store.effects.getInputs('mine'), { video: true, audio: false });
  assert.deepEqual(calls, [], 'saving a non-running effect leaves the room alone');

  const applied = await route('POST', '/api/graph/apply', json({ session: 'tab', id: 'mine2' }));
  assert.deepEqual(applied.json, { succeeded: true, id: 'mine2', activeEffectId: 'mine2', effect: 'mine2', requestedEffect: 'mine2' });
  assert.deepEqual(calls, ['active']);
  // Saving over the running effect reloads the room.
  await route('POST', '/api/graph/save', json({ session: 'tab', id: 'mine2' }));
  assert.deepEqual(calls, ['active', 'active']);
}

// Without engine-reported inputs the page reads them from the graph (the 51nv.10 fallback).
{
  const { route, store } = setup({ withInputs: false });
  await putDraft(route, 'tab', { ...GOOD, nodes: [{ id: 'a', type: 'audio.capture', params: {} }] });
  await route('POST', '/api/graph/save', json({ session: 'tab', id: 'aud' }));
  assert.deepEqual(store.effects.getInputs('aud'), { video: false, audio: true });
}

// Without an engine the draft routes say so, they do not hang.
{
  const bare = createRouter(createShimStore(createMemoryStorage(), {}));
  const answer = await bare('PUT', '/api/graph/drafts/s', json({ graph: GOOD }));
  assert.deepEqual([answer.status, answer.json.error], [503, 'engine_unavailable']);
}

// Params: edits land in the stored graph, validated, the room reloads when it runs there.
{
  const { route, store, calls } = setup();
  store.effects.putCustom('mine', GOOD);
  assert.equal((await route('PUT', '/api/effects/Bad Id/params', json({ params: [1] }))).json.error, 'invalid_effect_id');
  assert.equal((await route('PUT', '/api/effects/mine/params', json({ params: [] }))).json.error, 'invalid_body');
  assert.equal((await route('PUT', '/api/effects/nope/params', json({ params: [{ node: 'z', param: 'p', value: 1 }] }))).status, 404);
  assert.equal((await route('PUT', '/api/effects/builtin.video/params', json({ params: [{ node: 'z', param: 'p', value: 1 }] }))).status, 400);
  const unknown = await route('PUT', '/api/effects/mine/params', json({ params: [{ node: 'ghost', param: 'p', value: 1 }] }));
  assert.deepEqual([unknown.status, unknown.json.error], [422, 'unknown_node']);
  const done = await route('PUT', '/api/effects/mine/params', json({ params: [{ node: 'z', param: 'output', value: 'hue' }] }));
  assert.deepEqual(done.json, { succeeded: true, id: 'mine', effect: 'builtin.video', requestedEffect: 'builtin.video' });
  assert.equal(store.effects.getCustom('mine').nodes[1].params.output, 'hue');
  assert.deepEqual(calls, []);
  await route('PUT', '/api/effects', json({ activeEffectId: 'mine' }));
  await route('PUT', '/api/effects/mine/params', json({ params: [{ node: 'z', param: 'output', value: 'hue2' }] }));
  assert.equal(calls.length, 2);
}

// Duplicate: real copies of built-ins and custom effects, core's refusals.
{
  const { route, store } = setup();
  const copy = await route('POST', '/api/effects/builtin.video/duplicate', json({ id: 'my-copy', title: 'My copy' }));
  assert.deepEqual(copy.json, { succeeded: true, id: 'my-copy', source: 'builtin.video' });
  const stored = store.effects.getCustom('my-copy');
  assert.equal(stored.title, 'My copy');
  assert.equal(stored.nodes.length > 3, true);
  assert.deepEqual(store.effects.getInputs('my-copy'), { video: true, audio: false });
  const again = await route('POST', '/api/effects/my-copy/duplicate', json({ id: 'copy-2' }));
  assert.equal(again.json.source, 'my-copy');
  assert.deepEqual((await route('GET', '/api/effects')).json.effects.map((e) => e.id), ['builtin.video', 'builtin.audio', 'my-copy', 'copy-2']);
  assert.equal((await route('POST', '/api/effects/my-copy/duplicate', json({ id: 'copy-2' }))).status, 409);
  assert.equal((await route('POST', '/api/effects/ghost/duplicate', json({ id: 'copy-3' }))).status, 404);
  assert.equal((await route('POST', '/api/effects/my-copy/duplicate', json({ id: 'Bad Id' }))).json.error, 'invalid_effect_id');
  assert.equal((await route('POST', '/api/effects/my-copy/duplicate', json({ id: 'ok', title: 'x'.repeat(81) }))).json.error, 'invalid_title');
  assert.equal((await route('POST', '/api/effects/my-copy/duplicate', json({}))).json.error, 'invalid_body');
  // The copy is a copy: editing it leaves the source alone.
  store.effects.getCustom('copy-2').nodes.length = 0;
  assert.equal(store.effects.getCustom('my-copy').nodes.length > 0, true);
}

// Light test: the room takes the draft, heartbeats keep it, silence and the cap end it.
{
  let now = 0;
  const timers = new Set();
  const { engine } = fakeEngine();
  const calls = [];
  const hooks = { engine, onTestGraph: (doc, inputs) => { calls.push('start'); return ''; }, onTestEnd: () => calls.push('end') };
  const store = createShimStore(createMemoryStorage(), {});
  const lightTest = createLightTest({
    hooks: { start: (doc, inputs) => hooks.onTestGraph(doc, inputs), revert: () => hooks.onTestEnd() },
    clock: () => now,
    setTimer: (fn) => { timers.add(fn); return fn; },
    clearTimer: (fn) => timers.delete(fn),
  });
  const route = createRouter(store, hooks);
  await putDraft(route, 'tab', GOOD);
  assert.equal((await route('POST', '/api/graph/test', 'nope')).status, 400);
  assert.equal((await route('POST', '/api/graph/test', json({ session: 'none' }))).json.error, 'no_draft');
  assert.equal((await route('POST', '/api/graph/test', json({ session: 'tab', mode: 'fast' }))).json.error, 'invalid_mode');
  await putDraft(route, 'broken', BAD);
  assert.equal((await route('POST', '/api/graph/test', json({ session: 'broken' }))).status, 422);

  const started = await route('POST', '/api/graph/test', json({ session: 'tab' }));
  assert.deepEqual(started.json, { succeeded: true, mode: 'once', confirmWithinMs: 15000, heartbeatMs: 2000, revertAfterMs: 6000 });
  assert.deepEqual(calls, ['start']);
  const { confirmRemainingMs: left, ...rest } = (await route('GET', '/api/state')).json.test;
  assert.deepEqual(rest, { active: true, mode: 'once', holder: { session: 'tab', client: null } });
  assert.ok(left > 14000 && left <= 15000);
  const beating = (await route('POST', '/api/graph/test/heartbeat', json({ session: 'tab' }))).json;
  assert.deepEqual([beating.succeeded, beating.mode], [true, 'once']);
  const noTest = await route('POST', '/api/graph/test/heartbeat', json({ session: 'other' }));
  assert.deepEqual([noTest.status, noTest.json.error, noTest.json.lastEnd], [404, 'no_test', null]);
  assert.equal((await route('POST', '/api/graph/test/revert', json({ session: 'other' }))).json.error, 'no_test');
  assert.deepEqual((await route('POST', '/api/graph/test/revert', json({ session: 'tab' }))).json, { succeeded: true });
  assert.deepEqual(calls, ['start', 'end']);
  const beat = await route('POST', '/api/graph/test/heartbeat', json({ session: 'tab' }));
  assert.equal(beat.json.lastEnd, 'reverted');
  assert.equal((await route('POST', '/api/graph/test/stop', '{}')).status, 404);
  assert.equal((await route('GET', '/api/state')).json.test.active, false);
}

// Light test timing, on the controller with a fake clock.
{
  let now = 0;
  let timer = null;
  const calls = [];
  const lt = createLightTest({
    hooks: { start: () => '', revert: () => { calls.push('revert'); } },
    clock: () => now,
    setTimer: (fn) => { timer = fn; return 1; },
    clearTimer: () => { timer = null; },
  });
  assert.equal(lt.start('a', GOOD, { video: true, audio: false }), '');
  now = 5000; lt.heartbeat('a');
  now = 10000; timer();
  assert.equal(lt.info().active, true, 'a beat 5 s ago holds the test');
  now = 15000; timer();
  assert.deepEqual([lt.info().active, lt.info().lastEnd, calls], [false, 'confirm_timeout', ['revert']]);
  assert.equal(timer, null, 'the watchdog stops with the test');
  now = 20000;
  lt.start('a', GOOD, {}, 'live');
  assert.equal(lt.info().confirmRemainingMs, null);
  now = 100000; timer();
  assert.equal(lt.info().lastEnd, 'heartbeat_lost');
  lt.start('a', GOOD, {});
  lt.start('b', GOOD, {});
  assert.equal(lt.info().lastEnd, 'replaced');
  assert.equal(lt.stop('superseded'), true);
  assert.equal(lt.info().lastEnd, 'superseded');
  assert.equal(createLightTest({ hooks: { start: () => 'no room', revert() {} } }).start('a', GOOD, {}), 'no room');
}

// Switching effect ends a running test.
{
  const { route, calls } = setup();
  await putDraft(route, 'tab', GOOD);
  await route('POST', '/api/graph/test', json({ session: 'tab', mode: 'live' }));
  await route('PUT', '/api/effects', json({ activeEffectId: 'builtin.audio' }));
  assert.equal(calls.includes('testEnd'), true);
  assert.equal((await route('GET', '/api/graph/test')).json.lastEnd, 'superseded');
}

// A refused test start is 409 cannot_test with the reason.
{
  const { route } = setup({ refuseTest: 'The light engine is not ready.' });
  await putDraft(route, 'tab', GOOD);
  const refused = await route('POST', '/api/graph/test', json({ session: 'tab' }));
  assert.deepEqual([refused.status, refused.json.error, refused.json.message], [409, 'cannot_test', 'The light engine is not ready.']);
}

// Layouts, dismiss, reload, pairing.
{
  const { route, calls } = setup();
  assert.deepEqual((await route('GET', '/api/graph/preview/layouts')).json, { output: 'hue', savedZones: 0, basicZones: 4 });
  assert.deepEqual((await route('POST', '/api/state/dismiss', json({ source: 'reload', id: 3 }))).json, { succeeded: true, dismissed: false });
  assert.deepEqual((await route('POST', '/api/state/dismiss', json({ source: 'reload' }))).json, { succeeded: false, error: 'source_and_id_required' });
  assert.deepEqual((await route('POST', '/api/reload')).json, { succeeded: true });
  assert.deepEqual(calls, ['active']);
  assert.equal((await route('GET', '/api/pairing/status')).json.error, 'unknown_route');
  assert.equal((await route('GET', '/api/pairing/pending')).status, 404);
}

// Preview stream: refusals match core, a session streams the engine's snapshots, drafts reload it.
{
  const { route, log } = setup();
  const events = [];
  const open = (query) => {
    const stream = route.streams('/api/graph/preview', new URLSearchParams(query));
    const sink = { emit: (name, data) => events.push([query, name, data]), end: () => events.push([query, 'end']) };
    stream.subscribe(sink);
    return stream;
  };
  assert.equal(route.streams('/api/other', new URLSearchParams()), null);
  open('session=bad session');
  open('session=tab&layout=weird');
  open('session=tab');
  await settle();
  assert.deepEqual(events.map(([, name, data]) => [name, data?.error]), [['error', 'invalid_session'], ['end', undefined], ['error', 'invalid_layout'], ['end', undefined], ['error', 'no_draft'], ['end', undefined]]);

  await putDraft(route, 'tab', GOOD);
  events.length = 0;
  const stream = open('session=tab&layout=room');
  await settle();
  await settle();
  assert.deepEqual(log.find((c) => c[0] === 'openPreview').slice(1, 2).concat(log.find((c) => c[0] === 'openPreview')[3]), ['tab', 'room']);
  const extras = route.roomExtras;
  assert.deepEqual(extras.steps(), [['previewSnapshot', ['tab']]]);
  assert.deepEqual(extras.inputs(), { video: true, audio: false });
  const snapshot = sample('preview-snapshot.json');
  extras.onResults([snapshot], extras.steps());
  extras.onResults([{ ...snapshot, tickMs: 5 }], extras.steps());
  assert.deepEqual(events.map(([, name]) => name), ['preview'], 'an unchanged frame is not sent again');
  assert.deepEqual(events[0][2], snapshot);
  extras.onResults([{ error: 'no_preview' }], extras.steps());
  // A broken draft reports once and keeps the old frame, a fixed one reloads silently.
  await putDraft(route, 'tab', BAD);
  await settle(); await settle();
  await putDraft(route, 'tab', BAD);
  await settle(); await settle();
  assert.deepEqual(events.filter(([, name]) => name === 'error').map(([, , data]) => data), [{ error: 'draft_invalid', message: 'broken' }]);
  // A second stream on the session replaces the first.
  open('session=tab');
  await settle(); await settle();
  assert.deepEqual(events.filter(([, name]) => name === 'ended').map(([, , data]) => data), [{ reason: 'replaced' }]);
  stream.close();
  assert.equal(log.filter((c) => c[0] === 'closePreview').length, 0, 'the replaced stream leaves the new session open');
}
{
  const { route, log } = setup();
  await putDraft(route, 'tab', GOOD);
  const events = [];
  const stream = route.streams('/api/graph/preview', new URLSearchParams('session=tab'));
  stream.subscribe({ emit: (name, data) => events.push([name, data]), end: () => events.push(['end']) });
  await settle(); await settle();
  stream.close();
  assert.deepEqual(log.filter((c) => c[0] === 'closePreview'), [['closePreview', 'tab']]);
  assert.deepEqual(route.roomExtras.steps(), []);
}

// Stores: drafts evict idle sessions and count limits.
{
  let now = 0;
  const drafts = createDraftStore({ clock: () => now });
  assert.equal(drafts.put('a', { x: 1 }), 'saved');
  assert.equal(drafts.put('a b', {}), 'invalid_session');
  now = 3601;
  assert.equal(drafts.get('a'), null);
  drafts.put('b', {});
  now = 7000;
  assert.equal(drafts.get('b') !== null, true);
  now = 10000;
  assert.equal(drafts.get('b') !== null, true, 'reading counts as use');
}

console.log('demo-graph-routes tests passed.');
