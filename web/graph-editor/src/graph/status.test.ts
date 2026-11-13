import { describe, expect, it } from 'vitest'
import { initialLoop, type LoopState } from './loop'
import { initialTest, testReducer, type TestState } from './lightTest'
import { changeIsEdit, pickBanner, pickStatus, quietEndToast, stopLabel, testFailureToast, testOutcome, type StatusInput } from './status'

const base: StatusInput = { openError: null, unreachable: false, loop: { ...initialLoop, valid: true, stream: 'live' }, test: initialTest, otherHolder: null, writeTrouble: null }
const withLoop = (l: Partial<LoopState>): StatusInput => ({ ...base, loop: { ...base.loop, ...l } })
const withTest = (t: Partial<TestState>): StatusInput => ({ ...base, test: { ...initialTest, ...t } })

describe('status priority', () => {
  it('rank 7: Live preview is the quiet default', () => {
    expect(pickStatus(base)).toMatchObject({ rank: 7, label: 'Live preview' })
  })
  it('rank 1: unreachable and cannot open beat everything', () => {
    const all = { ...withLoop({ putError: 'x', stream: 'replaced' }), openError: "Cannot open 'x'", writeTrouble: 'w' }
    expect(pickStatus(all)).toMatchObject({ rank: 1, where: 'button', label: 'Cannot reach Aurora', detail: "Cannot open 'x'" })
    expect(pickStatus({ ...base, unreachable: true })).toMatchObject({ rank: 1, where: 'button', label: 'Cannot reach Aurora', detail: 'Retrying.' })
  })
  it('a lost preview stream alone is not rank 1: the host poll owns reachable', () => {
    expect(pickStatus(withLoop({ stream: 'unreachable' })).rank).toBe(7)
  })
  it('a refused draft is not a status: the error shell and the chip say it', () => {
    for (const putError of ['too_many_drafts', 'invalid_session', 'invalid_body', 'draft_too_large']) {
      expect(pickStatus(withLoop({ putError })).where).not.toBe('banner')
    }
  })
  it('draft would not load is a Whole graph problem, not a banner', () => {
    const loop = { reloadError: 'bad' }
    expect(pickStatus(withLoop(loop))).toMatchObject({ rank: 7, where: 'none' })
    expect(pickBanner(null, false, pickStatus(withLoop(loop)))).toBeNull()
  })
  it('a reload error alongside problems reads Preview paused', () => {
    expect(pickStatus(withLoop({ valid: false, reloadError: 'bad', issues: [{ node: null, message: 'm' }] }))).toMatchObject({ rank: 7, label: 'Preview paused' })
  })
  it('rank 4: preview taken over carries Reconnect', () => {
    expect(pickStatus(withLoop({ stream: 'replaced' }))).toMatchObject({ rank: 4, where: 'button', label: 'Reconnect', action: 'reconnect' })
  })
  it('rank 5: lights in use by another session, from the host poll', () => {
    expect(pickStatus({ ...base, otherHolder: { session: 's', client: 'mcp' } })).toMatchObject({ rank: 5, where: 'button', action: 'take-over', label: 'Take over', detail: 'Lights in use: an agent is testing' })
    // Not while this tab is testing: that is Stop.
    expect(pickStatus({ ...withTest({ phase: 'running' }), otherHolder: { session: 's', client: null } }).rank).toBe(7)
  })
  it('rank 6 is a failed Save only: test outcomes and failures are not a banner', () => {
    expect(pickStatus(withTest({ failure: 'no' })).where).toBe('none')
    for (const reason of ['heartbeat_lost', 'replaced', 'stopped', 'superseded', 'pipeline_gone', 'unreachable']) {
      expect(pickStatus(withTest({ ended: { reason, holder: null } })).where).toBe('none')
    }
    expect(pickStatus({ ...base, writeTrouble: 'Fix the 2 problems before saving' })).toMatchObject({ rank: 6, label: 'Fix the 2 problems before saving' })
  })
  it('testOutcome words each end the user did not cause, and only those', () => {
    const say = (reason: string | null, holder = null as { session: string; client: string | null } | null) => testOutcome(withTest({ ended: { reason, holder } }).test)
    expect(say('replaced', { session: 's', client: 'mcp' })).toBe('Test ended: an agent took the lights')
    expect(say('heartbeat_lost')).toContain('stopped hearing')
    expect(say('stopped')).toContain('Dashboard')
    expect(say('superseded')).toContain('another effect')
    expect(say('pipeline_gone')).toContain('paused or restarted')
    for (const quiet of ['kept', 'reverted', 'confirmed', 'confirm_timeout', 'unreachable', null]) expect(say(quiet)).toBeNull()
    expect(testOutcome(withTest({ phase: 'running', ended: { reason: 'stopped', holder: null } }).test)).toBeNull()
  })
  it('a start the server refused is a toast with its own words', () => {
    expect(testFailureToast(withTest({ failure: 'Lights are paused' }).test)).toBe('Lights are paused')
    expect(testFailureToast(initialTest)).toBeNull()
  })
  it('Reverted, Kept and the end of a Once test are toasts, not status', () => {
    for (const reason of ['reverted', 'kept', 'confirm_timeout']) {
      expect(pickStatus(withTest({ ended: { reason, holder: null } }))).toMatchObject({ rank: 7, where: 'none' })
    }
    expect(quietEndToast(withTest({ ended: { reason: 'reverted', holder: null } }).test)).toBe('Reverted')
    expect(quietEndToast(withTest({ ended: { reason: 'confirm_timeout', holder: null } }).test)).toMatch(/lights are back/)
    expect(quietEndToast(withTest({ ended: { reason: 'heartbeat_lost', holder: null } }).test)).toBeNull()
  })
  it('problems read Preview paused; the chip carries the count', () => {
    expect(pickStatus(withLoop({ valid: false, issues: [{ node: null, message: 'm' }] }))).toMatchObject({ rank: 7, label: 'Preview paused' })
  })
  it('a higher rank hides a lower one, which returns when it resolves', () => {
    const both = withLoop({ stream: 'replaced', valid: false })
    expect(pickStatus(both).rank).toBe(4)
    expect(pickStatus({ ...both, loop: { ...both.loop, stream: 'live' } }).label).toBe('Preview paused')
  })
  it('other rank 7 states', () => {
    expect(pickStatus(withLoop({ stream: 'connecting' })).label).toBe('Connecting')
    expect(pickStatus(withLoop({ stream: 'paused' })).label).toBe('Preview paused')
    expect(pickStatus(withLoop({ stream: 'closed', valid: null })).label).toBe('Connecting')
  })
})

describe('Stop label and banner', () => {
  it('Stop counts down in Once and is bare in Live', () => {
    expect(stopLabel({ ...initialTest, phase: 'running', remainingMs: 12000 })).toBe('Stop 0:12')
    expect(stopLabel({ ...initialTest, phase: 'running', remainingMs: 11100 })).toBe('Stop 0:12')
    expect(stopLabel({ ...initialTest, mode: 'live', phase: 'running' })).toBe('Stop')
  })
  it('banner: persistent errors (rank 6) show under the bar', () => {
    const s = pickStatus({ ...base, writeTrouble: 'Fix the 2 problems before saving' })
    expect(pickBanner(null, false, s)).toEqual({ kind: 'notice', message: 'Fix the 2 problems before saving', detail: null })
    expect(pickBanner(null, false, pickStatus(base))).toBeNull()
  })
  it('banner: unreachable beats restore; nothing otherwise', () => {
    expect(pickBanner('Cannot reach Aurora', true)).toMatchObject({ kind: 'unreachable' })
    expect(pickBanner(null, true)).toEqual({ kind: 'restore' })
    expect(pickBanner(null, false)).toBeNull()
  })
})

describe('changeIsEdit', () => {
  const a = {}, b = {}
  it('is not an edit when an effect opens', () => {
    expect(changeIsEdit(null, a)).toBe(false)
    expect(changeIsEdit(a, null)).toBe(false)
  })
  it('is an edit for any later change, even one back to the saved graph', () => {
    expect(changeIsEdit(a, b)).toBe(true)
  })
  it('is not an edit when nothing changed', () => {
    expect(changeIsEdit(a, a)).toBe(false)
  })
})

describe('test mode', () => {
  it('starting records the mode and a later Once start returns to a countdown', () => {
    const live = testReducer(initialTest, { type: 'starting', mode: 'live' })
    expect(live.mode).toBe('live')
    expect(testReducer(live, { type: 'starting', mode: 'once' }).mode).toBe('once')
  })
})
