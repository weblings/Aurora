import { describe, expect, it } from 'vitest'
import { activeZones, parseFrame, parseZoneRegions } from './frame'
import { initialLoop, loopReducer, reopenDelay, summarize, type LoopEvent, type LoopState } from './loop'
import { problemCount } from '../ProblemsChip'
import { draftIssues, groupProblems, sameProblems, unattributed, type ServerIssue } from './problems'

const run = (events: LoopEvent[], from: LoopState = initialLoop) => events.reduce(loopReducer, from)
const ids = new Set(['gain', 'send'])

describe('draftIssues', () => {
  it('a valid draft the server cannot build is one Whole graph problem with the server text, and counts', () => {
    const state = run([{ type: 'put', valid: true, issues: [] }, { type: 'draft-invalid', message: 'needs input "audio"' }])
    const p = groupProblems(draftIssues(state), [], ids)
    expect(p.graph).toEqual(['needs input "audio"'])
    expect(problemCount(p)).toBe(1)
  })
  it('the next valid put clears it', () => {
    const state = run([{ type: 'draft-invalid', message: 'x' }, { type: 'put', valid: true, issues: [] }])
    expect(draftIssues(state)).toEqual([])
  })
  it('with problems the issues explain the refusal, so the reload text is not added', () => {
    const issues = [{ node: 'gain', message: 'm' }]
    const state = { ...run([{ type: 'put', valid: false, issues }]), reloadError: 'bad' }
    expect(draftIssues(state)).toEqual(issues)
  })
})

describe('groupProblems', () => {
  it('badges the node, and the port or param an issue names', () => {
    const issues: ServerIssue[] = [
      { node: 'gain', message: 'gain: input "frame" is not connected', code: 'input_unconnected', port: 'frame' },
      { node: 'gain', message: 'gain: must be between 0 and 2', param: 'gain' },
      { node: 'send', message: 'send: output "x" is not registered', param: 'output' },
      { node: 'gain', message: 'gain: something else' },
    ]
    const p = groupProblems(issues, [], ids)
    const gain = p.nodes.get('gain')!
    expect(gain.messages).toHaveLength(3)
    expect(gain.ports.get('frame')).toEqual(['gain: input "frame" is not connected'])
    expect(gain.params.get('gain')).toEqual(['gain: must be between 0 and 2'])
    expect(unattributed(gain)).toEqual(['gain: something else'])
    expect(p.nodes.get('send')!.params.get('output')).toHaveLength(1)
    expect(p.graph).toEqual([])
  })

  it('sends issues with no node, or a node not in the document, to the graph list', () => {
    const p = groupProblems(
      [
        { node: null, message: 'graph has a cycle' },
        { node: 'gone', message: 'gone: bad' },
      ],
      [],
      ids,
    )
    expect(p.nodes.size).toBe(0)
    expect(p.graph).toEqual(['graph has a cycle', 'gone: bad'])
  })

  it('adds runtime preview errors to their node and drops duplicates', () => {
    const p = groupProblems(
      [{ node: 'send', message: 'same' }],
      [
        { output: 'hue', node: 'send', message: 'same' },
        { output: 'hue', node: 'gain', message: 'tick failed' },
        { output: 'hue', node: '', message: 'no node' },
      ],
      ids,
    )
    expect(p.nodes.get('send')!.messages).toEqual(['same'])
    expect(p.nodes.get('gain')!.messages).toEqual(['tick failed'])
    expect(p.graph).toEqual(['no node'])
  })

  it('recognises an unchanged set of problems', () => {
    const a = groupProblems([{ node: 'gain', message: 'x' }], [], ids)
    expect(sameProblems(a, groupProblems([{ node: 'gain', message: 'x' }], [], ids))).toBe(true)
    expect(sameProblems(a, groupProblems([{ node: 'gain', message: 'y' }], [], ids))).toBe(false)
    expect(sameProblems(a, groupProblems([], [], ids))).toBe(false)
  })
})

describe('draft loop states', () => {
  const issue: ServerIssue = { node: 'gain', message: 'bad' }

  it('goes from no draft (reads Connecting) through connecting to live', () => {
    expect(summarize(initialLoop).label).toBe('Connecting')
    const s = run([{ type: 'put', valid: true, issues: [] }, { type: 'opening' }])
    expect(summarize(s).label).toBe('Connecting')
    expect(summarize(loopReducer(s, { type: 'frame', errors: [] })).label).toBe('Live preview')
  })

  it('reports an invalid draft by count and keeps the stream state under it', () => {
    const live = run([{ type: 'put', valid: true, issues: [] }, { type: 'opening' }, { type: 'frame', errors: [] }])
    const broken = loopReducer(live, { type: 'put', valid: false, issues: [issue, issue] })
    expect(summarize(broken).label).toBe('2 problems')
    expect(broken.stream).toBe('live')
    expect(summarize(loopReducer(broken, { type: 'put', valid: true, issues: [] })).label).toBe('Live preview')
  })

  it('shows a reload the server refused until the next draft lands', () => {
    const live = run([{ type: 'put', valid: true, issues: [] }, { type: 'opening' }, { type: 'frame', errors: [] }])
    const stuck = loopReducer(live, { type: 'draft-invalid', message: 'cannot start input' })
    expect(summarize(stuck)).toEqual({ label: 'Draft would not load', detail: 'cannot start input' })
    expect(loopReducer(stuck, { type: 'put', valid: true, issues: [] }).reloadError).toBeNull()
  })

  it('moves to paused on pipeline_gone and back to live on resume', () => {
    const live = run([{ type: 'put', valid: true, issues: [] }, { type: 'opening' }, { type: 'frame', errors: [] }])
    const paused = loopReducer(live, { type: 'ended', reason: 'pipeline_gone' })
    expect(paused.stream).toBe('paused')
    expect(summarize(paused).label).toBe('Preview paused')
    expect(reopenDelay(paused)).toBe(2000)
    // Reopening while still paused is refused, which keeps it paused.
    const again = run([{ type: 'opening' }, { type: 'refused', error: 'cannot_preview', message: 'no pipeline is running' }], paused)
    expect(again.stream).toBe('paused')
    expect(summarize(again).detail).toBe('no pipeline is running')
    expect(run([{ type: 'opening' }, { type: 'frame', errors: [] }], again).stream).toBe('live')
  })

  it('does not reopen a replaced preview by itself', () => {
    const live = run([{ type: 'put', valid: true, issues: [] }, { type: 'opening' }, { type: 'frame', errors: [] }])
    const replaced = loopReducer(live, { type: 'ended', reason: 'replaced' })
    expect(summarize(replaced).label).toBe('Preview taken over')
    expect(reopenDelay(replaced)).toBeNull()
  })

  it('re-sends the draft after the server dropped it', () => {
    const live = run([{ type: 'put', valid: true, issues: [] }, { type: 'opening' }, { type: 'frame', errors: [] }])
    const dropped = loopReducer(live, { type: 'ended', reason: 'draft_deleted' })
    expect(dropped.stream).toBe('closed')
    expect(reopenDelay(dropped)).toBe(500)
    expect(reopenDelay(run([{ type: 'put', valid: false, issues: [issue] }]))).toBeNull()
  })

  it('reports a refused draft and an unreachable server', () => {
    expect(summarize(loopReducer(initialLoop, { type: 'put-failed', reason: 'too_many_drafts' }))).toEqual({
      label: 'Draft not sent',
      detail: 'too_many_drafts',
    })
    const lost = run([{ type: 'put', valid: true, issues: [] }, { type: 'opening' }, { type: 'lost' }])
    expect(summarize(lost).label).toBe('Aurora unreachable')
    expect(reopenDelay(lost)).toBe(3000)
  })

  it('clears runtime errors when the stream ends and when a document closes', () => {
    const err = { output: 'hue', node: 'gain', message: 'oops' }
    const live = run([{ type: 'opening' }, { type: 'frame', errors: [err] }])
    expect(live.runtime).toEqual([err])
    expect(loopReducer(live, { type: 'ended', reason: 'pipeline_gone' }).runtime).toEqual([])
    expect(loopReducer(live, { type: 'reset' })).toEqual(initialLoop)
  })
})

describe('preview frames', () => {
  const payload = {
    session: 's',
    tickMs: 1,
    outputs: [
      { output: 'hue', zones: Array.from({ length: 10 }, (_, id) => ({ id, r: 1, g: 0.5, b: 0, error: id === 3 })) },
      { output: 'strip', zones: [{ id: 0, r: 0, g: 0, b: 0, error: false }] },
    ],
    errors: [{ output: 'hue', node: 'gain', message: 'oops' }],
  }

  it('parses zones, error flags and runtime errors', () => {
    const f = parseFrame(JSON.stringify(payload))!
    expect(f.outputs.map((o) => o.zones.length)).toEqual([10, 1])
    expect(f.outputs[0].zones[3].error).toBe(true)
    expect(f.errors).toEqual([{ output: 'hue', node: 'gain', message: 'oops' }])
  })

  it('gives null for junk instead of throwing', () => {
    expect(parseFrame('not json')).toBeNull()
    expect(parseFrame('null')).toBeNull()
    expect(parseFrame('{"outputs":5}')).toBeNull()
    expect(parseFrame('{"outputs":[1,{"output":"x"}]}')!.outputs).toEqual([])
  })

  it('takes the named output as the active one, else the first', () => {
    const f = parseFrame(JSON.stringify(payload))!
    expect(activeZones(f, f.outputs[1].output)).toBe(f.outputs[1].zones)
    expect(activeZones(f, 'nope')).toBe(f.outputs[0].zones)
    expect(activeZones(f, null)).toBe(f.outputs[0].zones)
    expect(activeZones({ outputs: [], errors: [] }, null)).toEqual([])
  })
})

describe('parseZoneRegions', () => {
  const zones = {
    outputName: 'hue',
    zones: [
      { zoneId: 0, uvs: { min: [0, 0], max: [0.5, 0.5] }, active: true },
      { zoneId: 1, uvs: { min: [0.5, 0.5], max: [1, 1] }, active: true },
      { zoneId: 2, uvs: { min: [0.4, 0.4], max: [0.4, 0.9] }, active: true },
      { zoneId: 3, active: true },
    ],
  }
  it('keeps only zones with a usable uv rect', () => {
    expect(parseZoneRegions(zones)!.zones.map((z) => z.id)).toEqual([0, 1])
    expect(parseZoneRegions({ outputName: 'x' })).toBeNull()
    expect(parseZoneRegions(null)).toBeNull()
  })
})
