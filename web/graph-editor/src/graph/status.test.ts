import { describe, expect, it } from 'vitest'
import { initialLoop, type LoopState } from './loop'
import { initialTest, type TestState } from './lightTest'
import { pickBanner, pickStatus, testProgress, type StatusInput } from './status'

const base: StatusInput = { openError: null, loop: { ...initialLoop, valid: true, stream: 'live' }, test: initialTest, writeTrouble: null, testOutcomeCleared: false }
const withLoop = (l: Partial<LoopState>): StatusInput => ({ ...base, loop: { ...base.loop, ...l } })
const withTest = (t: Partial<TestState>): StatusInput => ({ ...base, test: { ...initialTest, ...t } })

describe('status priority', () => {
  it('rank 7: Live preview is the quiet default', () => {
    expect(pickStatus(base)).toMatchObject({ rank: 7, label: 'Live preview' })
  })
  it('rank 1: cannot open, and an unreachable stream, beat everything', () => {
    const all = { ...withLoop({ putError: 'x', stream: 'replaced' }), openError: "Cannot open 'x'", writeTrouble: 'w' }
    expect(pickStatus(all)).toMatchObject({ rank: 1, label: 'Aurora unreachable', detail: "Cannot open 'x'" })
    expect(pickStatus(withLoop({ stream: 'unreachable' })).rank).toBe(1)
  })
  it('rank 3: draft not sent, draft would not load', () => {
    expect(pickStatus(withLoop({ putError: 'too_many_drafts' }))).toMatchObject({ rank: 3, label: 'Draft not sent', detail: 'too_many_drafts' })
    expect(pickStatus(withLoop({ reloadError: 'bad' }))).toMatchObject({ rank: 3, label: 'Draft would not load' })
  })
  it('rank 4: preview taken over carries Reconnect', () => {
    expect(pickStatus(withLoop({ stream: 'replaced' }))).toMatchObject({ rank: 4, action: 'reconnect' })
  })
  it('rank 5: lights in use by another session', () => {
    expect(pickStatus(withTest({ other: { session: 's', client: 'mcp' } }))).toMatchObject({ rank: 5, label: 'Lights in use: an agent is testing' })
  })
  it('rank 6: test and write failures; a write failure wins over a cleared test outcome', () => {
    expect(pickStatus(withTest({ failure: 'no' }))).toMatchObject({ rank: 6, label: 'no' })
    expect(pickStatus(withTest({ ended: { reason: 'confirm_timeout', holder: null } })).rank).toBe(6)
    expect(pickStatus({ ...withTest({ ended: { reason: 'confirm_timeout', holder: null } }), testOutcomeCleared: true }).rank).toBe(7)
    expect(pickStatus({ ...base, writeTrouble: 'Fix the 2 problems before saving' })).toMatchObject({ rank: 6, label: 'Fix the 2 problems before saving' })
  })
  it('a taken test is rank 6, not rank 5', () => {
    const t = withTest({ other: { session: 's', client: null }, ended: { reason: 'replaced', holder: { session: 's', client: null } } })
    expect(pickStatus(t)).toMatchObject({ rank: 6, label: 'Test ended: another editor tab or window took the lights' })
  })
  it('Reverted and Kept are toasts, not status', () => {
    expect(pickStatus(withTest({ ended: { reason: 'reverted', holder: null } })).label).toBe('Live preview')
    expect(pickStatus(withTest({ ended: { reason: 'kept', holder: null } })).label).toBe('Live preview')
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
    expect(pickStatus(withLoop({ stream: 'closed', valid: null })).label).toBe('No draft yet')
  })
})

describe('test progress and banner', () => {
  it('names the phase beside Revert', () => {
    expect(testProgress({ ...initialTest, phase: 'running', remainingMs: 4100 })).toBe('Testing, 5 s left')
    expect(testProgress({ ...initialTest, phase: 'closing' })).toBe('Working')
    expect(testProgress(initialTest)).toBeNull()
  })
  it('banner: unreachable beats restore; nothing otherwise', () => {
    expect(pickBanner('Cannot reach Aurora', true)).toMatchObject({ kind: 'unreachable' })
    expect(pickBanner(null, true)).toEqual({ kind: 'restore' })
    expect(pickBanner(null, false)).toBeNull()
  })
})
