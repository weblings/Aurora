import { describe, expect, it } from 'vitest'
import { addControl, controlIndex, controlsOf, dropControlsOf, moveControl, removeControl, updateControl } from './controls'
import { removeNodes } from './doc'
import { builtinLike, catalog, customLike } from './fixtures'
import { describeTest, initialTest, testReducer, type TestEvent, type TestState } from './lightTest'
import { freshEffectId, slugify } from './save'

const run = (events: TestEvent[], from: TestState = initialTest) => events.reduce(testReducer, from)
const running = run([{ type: 'starting' }, { type: 'started', remainingMs: 120000 }])

describe('dashboard controls', () => {
  it('adds a param with the catalog label and the node title as section', () => {
    const next = addControl(builtinLike(), 'rescale', 'width', catalog.get('image.rescale'))
    expect(controlsOf(next).at(-1)).toEqual({ node: 'rescale', param: 'width', label: 'Width', section: 'Rescale' })
    expect(controlIndex(next, 'rescale', 'width')).toBe(1)
  })

  it('falls back to the param name when it has no label, and adds a control list when there is none', () => {
    const next = addControl(customLike(), 'zones', 'output', catalog.get('zones.sample'))
    expect(next.controls).toEqual([{ node: 'zones', param: 'output', label: 'output', section: 'Sample zones' }])
  })

  it('does not add the same param twice', () => {
    const doc = builtinLike()
    expect(addControl(doc, 'gain', 'gain', catalog.get('frame.gain'))).toBe(doc)
  })

  it('edits text, drops an emptied tooltip, and keeps keys it does not know', () => {
    let doc = builtinLike()
    doc = { ...doc, controls: [{ node: 'gain', param: 'gain', config: 'x', tooltip: 'old' }] }
    doc = updateControl(doc, 0, { label: 'Strength', tooltip: '  ' })
    expect(doc.controls).toEqual([{ node: 'gain', param: 'gain', config: 'x', label: 'Strength' }])
  })

  it('reorders within bounds and removes', () => {
    let doc = builtinLike()
    doc = addControl(doc, 'rescale', 'width', catalog.get('image.rescale'))
    const moved = moveControl(doc, 1, -1)
    expect(controlsOf(moved).map((c) => c.node)).toEqual(['rescale', 'gain'])
    expect(moveControl(doc, 1, 1)).toBe(doc)
    expect(controlsOf(removeControl(moved, 0)).map((c) => c.node)).toEqual(['gain'])
  })

  it('removing the last control leaves an empty list, and a graph with none stays without the key', () => {
    expect(removeControl(builtinLike(), 0).controls).toEqual([])
    const bare = customLike()
    expect(removeControl(bare, 0)).toBe(bare)
  })

  it('ignores malformed entries instead of throwing', () => {
    const doc = { ...builtinLike(), controls: [null, 3, { node: 'gain' }, { node: 'gain', param: 'gain' }] as never }
    expect(controlsOf(doc)).toEqual([{ node: 'gain', param: 'gain' }])
  })

  it('deleting a node takes its controls along, so the loader finds no dangling name', () => {
    const doc = removeNodes(builtinLike(), new Set(['gain']))
    expect(doc.controls).toEqual([])
    expect(dropControlsOf(customLike(), new Set(['cap']))).toEqual(customLike())
  })
})

describe('new effect ids', () => {
  it('slugifies a title into the server id alphabet', () => {
    expect(slugify('My Cool Effect!')).toBe('my-cool-effect')
    expect(slugify('  --  ')).toBe('effect')
    expect(slugify('Ünïcode ✨')).toBe('n-code')
    expect(slugify('a'.repeat(100))).toHaveLength(48)
  })

  it('numbers a clash instead of overwriting', () => {
    expect(freshEffectId('Mine', ['builtin.video'])).toBe('mine')
    expect(freshEffectId('Mine', ['mine'])).toBe('mine-2')
    expect(freshEffectId('Mine', ['mine', 'mine-2'])).toBe('mine-3')
  })
})

describe('light test states', () => {
  it('runs: starting, running with a countdown, a heartbeat sets the exact time', () => {
    expect(run([{ type: 'starting' }]).phase).toBe('starting')
    expect(running.phase).toBe('running')
    const later = run([{ type: 'tick', ms: 1000 }, { type: 'tick', ms: 1000 }], running)
    expect(later.remainingMs).toBe(118000)
    expect(run([{ type: 'beat', remainingMs: 90000 }], later).remainingMs).toBe(90000)
    expect(run([{ type: 'tick', ms: 500000 }], running).remainingMs).toBe(0)
  })

  it('a start the server refuses goes back to idle with the reason', () => {
    const state = run([{ type: 'starting' }, { type: 'start-failed', message: 'paused' }])
    expect(state).toMatchObject({ phase: 'idle', failure: 'paused' })
    expect(describeTest(state)).toBe('paused')
    expect(run([{ type: 'starting' }], state).failure).toBeNull()
  })

  it('reports an agent taking the lights, and keeps showing who holds them', () => {
    const state = run([{ type: 'ended', end: { reason: 'replaced', holder: { session: 's', client: 'mcp' } } }], running)
    expect(state.phase).toBe('idle')
    expect(describeTest(state)).toBe('Test ended: an agent took the lights')
    expect(state.other).toEqual({ session: 's', client: 'mcp' })
  })

  it('reports another tab taking the lights', () => {
    const state = run([{ type: 'ended', end: { reason: 'replaced', holder: { session: 'editor-x', client: null } } }], running)
    expect(describeTest(state)).toBe('Test ended: another editor tab or window took the lights')
  })

  it('names every other way a test ends', () => {
    const say = (reason: string | null) => describeTest(run([{ type: 'ended', end: { reason, holder: null } }], running))
    expect(say('heartbeat_lost')).toContain('stopped hearing')
    expect(say('confirm_timeout')).toContain('time limit')
    expect(say('stopped')).toContain('Dashboard')
    expect(say('superseded')).toContain('another effect')
    expect(say('pipeline_gone')).toContain('paused or restarted')
    expect(say('unreachable')).toContain('Lost contact')
    expect(say(null)).toBe('Test ended')
  })

  it('keep and revert end the test and say so', () => {
    const kept = run([{ type: 'closing' }, { type: 'closed', kind: 'kept' }], running)
    expect(kept.phase).toBe('idle')
    expect(describeTest(kept)).toContain('Kept')
    expect(describeTest(run([{ type: 'closing' }, { type: 'closed', kind: 'reverted' }], running))).toContain('Reverted')
  })

  it('a refused keep leaves the test running with the reason', () => {
    const state = run([{ type: 'closing' }, { type: 'close-failed', message: 'changed' }], running)
    expect(state).toMatchObject({ phase: 'running', failure: 'changed' })
  })

  it('shows someone else’s test while idle, and not while running', () => {
    const other = { session: 'agent', client: 'mcp' }
    const idle = run([{ type: 'seen', holder: other }])
    expect(describeTest(idle)).toBe('Lights in use: an agent is testing')
    expect(run([{ type: 'seen', holder: other }], running)).toBe(running)
    expect(run([{ type: 'seen', holder: null }], idle).other).toBeNull()
  })

  it('has nothing to say before any test', () => {
    expect(describeTest(initialTest)).toBeNull()
  })
})
