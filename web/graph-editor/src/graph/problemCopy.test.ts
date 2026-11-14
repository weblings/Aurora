import { afterEach, describe, expect, it, vi } from 'vitest'
import { startTest } from '../api'
import { groupProblems, type ServerIssue } from './problems'

const ids = new Set(['gain', 'send'])

// What the popover rows and the node badges read: the grouped problems, in the editor's words.
describe('problem copy in the popover and badges (Aurora-u8jx.1)', () => {
  const issues: ServerIssue[] = [
    { node: 'gain', code: 'input_missing', port: 'frame', message: "node 'gain': missing required input 'frame' (expected Frame ...)" },
    { node: 'send', code: 'output_unregistered', param: 'output', message: "node 'send': unregistered output 'x'" },
    { node: 'gain', code: 'param_invalid', param: 'amount', message: "node 'gain': param 'amount' must be a number" },
    { node: null, code: 'version_missing', message: "top-level 'version' is required (expected 1)" },
    { node: 'gain', code: 'brand_new_code', message: 'the server text' },
  ]
  const p = groupProblems(issues, [], ids)

  it('node rows and badges use our words, pinned to the port or param', () => {
    const gain = p.nodes.get('gain')!
    expect(gain.ports.get('frame')).toEqual(['Nothing is connected to "frame". Connect a wire to it.'])
    expect(gain.params.get('amount')?.[0]).toMatch(/^"amount" has a value this node can't use/)
    expect(gain.messages).toHaveLength(3)
    expect(p.nodes.get('send')!.params.get('output')?.[0]).toMatch(/output Aurora doesn't have/)
  })

  it('a structural code in the Whole graph list shows the shared message', () => {
    expect(p.graph).toHaveLength(1)
    expect(p.graph[0]).toMatch(/damaged or not in the form Aurora expects/)
  })

  it('an unlisted code, or an issue with no code, keeps the server text', () => {
    expect(p.nodes.get('gain')!.messages).toContain('the server text')
    expect(groupProblems([{ node: 'gain', message: 'plain' }], [], ids).nodes.get('gain')!.messages).toEqual(['plain'])
  })

  it('runtime preview issues are not reworded here', () => {
    const q = groupProblems([], [{ output: 'hue', node: 'gain', message: 'oops' }], ids)
    expect(q.nodes.get('gain')!.messages).toEqual(['oops'])
  })
})

describe('refused test starts (Aurora-u8jx.1)', () => {
  afterEach(() => vi.unstubAllGlobals())
  const refuse = (status: number, body: object) =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status, json: async () => body })))

  it('a bare code shows our words', async () => {
    refuse(404, { succeeded: false, error: 'no_draft' })
    expect(await startTest('s')).toEqual({ ok: false, reason: "Aurora doesn't have this graph yet. Wait a moment, then try again." })
  })

  it('a code we do not list shows the server message, else the code', async () => {
    refuse(409, { succeeded: false, error: 'cannot_test', message: 'The lights are paused' })
    expect(await startTest('s')).toEqual({ ok: false, reason: 'The lights are paused' })
    refuse(500, { error: 'something_new' })
    expect(await startTest('s')).toEqual({ ok: false, reason: 'something_new' })
  })
})
