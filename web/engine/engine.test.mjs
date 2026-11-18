// Drives the built WASM module through every export and compares its JSON with
// web/graph-editor/src/graph/server-samples (Aurora-51nv.6). Run after an emcmake build:
//   node web/engine/engine.test.mjs <aurora-engine.mjs> [fixtureDir]
// The module path may come from AURORA_ENGINE_MODULE and the fixture dir from
// AURORA_ENGINE_FIXTURES. Without a fixture dir the test runs core/Wasm/parity/gen_fixtures.py
// into a temp dir (needs python). Pass Windows paths as C:/... .
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { wrapEngine } from './engine.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const samples = path.join(here, '../graph-editor/src/graph/server-samples')
const sample = (name) => JSON.parse(fs.readFileSync(path.join(samples, name), 'utf8'))

const modulePath = process.argv[2] ?? process.env.AURORA_ENGINE_MODULE
if (!modulePath) {
  console.error('usage: node web/engine/engine.test.mjs <aurora-engine.mjs> [fixtureDir]')
  process.exit(2)
}

function fixtureDir() {
  const given = process.argv[3] ?? process.env.AURORA_ENGINE_FIXTURES
  if (given) return given
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-fixtures-'))
  const script = path.join(here, '../../core/Wasm/parity/gen_fixtures.py')
  for (const python of ['python', 'python3']) {
    if (spawnSync(python, [script, dir], { stdio: 'ignore' }).status === 0) return dir
  }
  throw new Error('no fixture dir given and python could not write one')
}

const fixtures = fixtureDir()
const FRAME_W = 64
const FRAME_H = 32
const FRAME_BYTES = FRAME_W * FRAME_H * 4
const frames = new Uint8Array(fs.readFileSync(path.join(fixtures, 'frames.rgba')))
const frame = (n) => frames.subarray(n * FRAME_BYTES, (n + 1) * FRAME_BYTES)
const pcm = new Float32Array(new Uint8Array(fs.readFileSync(path.join(fixtures, 'pcm.f32'))).buffer)
const AUDIO_BLOCK = 800

// Must match core/tools/GenServerSamples.cpp.
const PREVIEW_TICKS = 8
const STEP = 1 / 60

const { default: createAuroraEngine } = await import(pathToFileURL(path.resolve(modulePath)).href)
const engine = wrapEngine(await createAuroraEngine())

const init = sample('inputs/init.json')
const videoGraph = sample('builtin.video.json').graph
const audioGraph = sample('builtin.audio.json').graph

function runPreview(session, doc) {
  assert.deepEqual(engine.openPreview(session, doc, 'basic'), { ok: true })
  for (let tick = 0; tick < PREVIEW_TICKS; tick++) {
    assert.deepEqual(engine.feedVideo(frame(tick), FRAME_W, FRAME_H), { ok: true })
    assert.deepEqual(engine.step(STEP), { ok: true })
  }
  return engine.previewSnapshot(session)
}

function assertShape(colors, zoneCount) {
  assert.equal(colors.outputs.length, 1)
  assert.equal(colors.outputs[0].output, 'hue')
  assert.equal(colors.outputs[0].zones.length, zoneCount)
  for (const zone of colors.outputs[0].zones) {
    assert.deepEqual(Object.keys(zone).sort(), ['b', 'error', 'g', 'id', 'r'])
    for (const channel of ['r', 'g', 'b']) assert.ok(zone[channel] >= 0 && zone[channel] <= 1)
  }
  assert.deepEqual(colors.errors, [])
}

const tests = []
const test = (name, fn) => tests.push([name, fn])

test('init takes outputs and zones', () => {
  assert.deepEqual(engine.init(init), { ok: true })
})

test('nodes matches nodes.json', () => {
  assert.deepEqual(engine.nodes(), sample('nodes.json'))
})

test('validate matches the ok and error samples', () => {
  assert.deepEqual(engine.validate(videoGraph), sample('validate-ok.json'))
  assert.deepEqual(engine.validate(sample('inputs/validate-errors.draft.json')), sample('validate-errors.json'))
})

test('validate accepts the built-in audio graph', () => {
  assert.deepEqual(engine.validate(audioGraph), { valid: true, errors: [] })
})

test('preview snapshot matches the sample', () => {
  assert.deepEqual(runPreview('sample', videoGraph), sample('preview-snapshot.json'))
  assert.deepEqual(engine.closePreview('sample'), { ok: true })
})

test('a failing node matches the error sample', () => {
  assert.deepEqual(runPreview('sample', sample('inputs/preview-error.draft.json')), sample('preview-error.json'))
  assert.deepEqual(engine.closePreview('sample'), { ok: true })
})

test('live video graph reports zone colors', () => {
  assert.deepEqual(engine.liveColors(), { error: 'no_live_graph' })
  assert.deepEqual(engine.loadLive(videoGraph), { ok: true })
  for (let tick = 0; tick < 10; tick++) {
    engine.feedVideo(frame(tick), FRAME_W, FRAME_H)
    engine.step(STEP)
  }
  const colors = engine.liveColors()
  assert.equal(colors.session, 'live')
  assertShape(colors, 4)
  assert.deepEqual(colors.outputs[0].zones.map((zone) => zone.id), [1, 2, 3, 4])
})

test('setZones changes the live zones without a reload', () => {
  const [first, second] = init.outputs[0].zones
  assert.deepEqual(engine.setZones('hue', [first, second]), { ok: true })
  engine.feedVideo(frame(10), FRAME_W, FRAME_H)
  engine.step(STEP)
  assertShape(engine.liveColors(), 2)
  assert.deepEqual(engine.setZones('hue', init.outputs[0].zones), { ok: true })
  assert.equal(engine.setZones('nope', []).error, 'unknown_output')
})

test('live audio graph reports zone colors', () => {
  assert.deepEqual(engine.loadLive(audioGraph), { ok: true })
  for (let tick = 0; tick < 60; tick++) {
    engine.feedAudio(pcm.subarray(tick * AUDIO_BLOCK, (tick + 1) * AUDIO_BLOCK), 48000, 1)
    engine.step(STEP)
  }
  assertShape(engine.liveColors(), 4)
})

test('previews open on each layout and reload without restarting', () => {
  assert.deepEqual(engine.openPreview('lights', videoGraph), { ok: true })
  assert.deepEqual(engine.openPreview('room', videoGraph, 'room'), { ok: true })
  assert.deepEqual(engine.openPreview('basic', videoGraph, 'basic'), { ok: true })
  engine.feedVideo(frame(0), FRAME_W, FRAME_H)
  engine.step(STEP)
  assertShape(engine.previewSnapshot('lights'), 4)
  assertShape(engine.previewSnapshot('room'), 4)
  assertShape(engine.previewSnapshot('basic'), 4)
  assert.deepEqual(engine.previewSnapshot('lights').outputs[0].zones.map((zone) => zone.id), [1, 2, 3, 4])
  assert.deepEqual(engine.previewSnapshot('basic').outputs[0].zones.map((zone) => zone.id), [0, 1, 2, 3])

  assert.deepEqual(engine.reloadPreview('basic', videoGraph), { ok: true })
  const broken = { ...videoGraph, edges: [] }
  const refused = engine.reloadPreview('basic', broken)
  assert.equal(refused.error, 'draft_invalid')
  assert.ok(refused.message)
  engine.step(STEP)
  assertShape(engine.previewSnapshot('basic'), 4)
})

test('preview errors are reported, not thrown', () => {
  assert.equal(engine.openPreview('bad', { version: 1, nodes: 'x' }, 'basic').error, 'cannot_preview')
  assert.equal(engine.openPreview('bad', videoGraph, 'sideways').error, 'invalid_layout')
  assert.equal(engine.openPreview('bad', '{not json', 'basic').error, 'invalid_json')
  assert.equal(engine.reloadPreview('missing', videoGraph).error, 'no_preview')
  assert.equal(engine.previewSnapshot('missing').error, 'no_preview')
  assert.equal(engine.loadLive({ version: 1, nodes: 'x' }).error, 'cannot_load')
  assert.equal(engine.validate('{not json').error, 'invalid_json')
  assert.equal(engine.setZones('hue', 'zones').error, 'invalid_zones')
  assert.equal(engine.feedVideo(new Uint8Array(3), 2, 2).error, 'invalid_frame')
})

test('closePreview ends a session and is safe to repeat', () => {
  for (const session of ['lights', 'room', 'basic']) {
    assert.deepEqual(engine.closePreview(session), { ok: true })
    assert.equal(engine.previewSnapshot(session).error, 'no_preview')
  }
  assert.deepEqual(engine.closePreview('basic'), { ok: true })
})

test('init rejects a bad config and keeps the module usable', () => {
  assert.equal(engine.init({ outputs: [{ name: 'hue', zones: [{ zoneId: 'x' }] }] }).error, 'invalid_init')
  assert.equal(engine.init('{not json').error, 'invalid_json')
  assert.deepEqual(engine.init(init), { ok: true })
  assert.deepEqual(engine.nodes(), sample('nodes.json'))
})

let failed = 0
for (const [name, fn] of tests) {
  try {
    fn()
    console.log(`ok   ${name}`)
  } catch (error) {
    failed++
    console.log(`FAIL ${name}\n${error.stack}`)
  }
}
console.log(`${tests.length - failed}/${tests.length} passed`)
process.exit(failed ? 1 : 0)
