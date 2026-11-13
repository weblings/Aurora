import { describe, expect, it } from 'vitest'
import { FAILURE_THRESHOLD, TOO_MANY_DRAFTS_MESSAGE, CHECK_FAILED_MESSAGE, draftShellNote, openFailedNote, openFailureCause, otherTest, parseHostState, reachAfter, reachable } from './hostState'

describe('parseHostState', () => {
  it('reads the fields the shell uses and never throws on a bad body', () => {
    expect(parseHostState(null)).toEqual({ state: null, errors: [], conditions: [], test: { active: false, remainingMs: null, holder: null } })
    expect(parseHostState('x').errors).toEqual([])
    const s = parseHostState({
      state: 'running',
      errors: [{ source: 'reload', message: 'm', id: 3 }, { nope: 1 }],
      conditions: [{ source: 'local_network', message: 'n' }],
      test: { active: true, mode: 'once', confirmRemainingMs: 12000, holder: { session: 'editor-a', client: 'mcp' } },
    })
    expect(s.state).toBe('running')
    expect(s.errors).toEqual([{ source: 'reload', message: 'm', id: 3 }])
    expect(s.conditions).toHaveLength(1)
    expect(s.test).toEqual({ active: true, remainingMs: 12000, holder: { session: 'editor-a', client: 'mcp' } })
  })
  it('a Live test has no deadline, and an idle one has no holder', () => {
    expect(parseHostState({ test: { active: true, confirmRemainingMs: null, holder: { session: 's', client: null } } }).test).toEqual({ active: true, remainingMs: null, holder: { session: 's', client: null } })
    expect(parseHostState({ test: { active: false, confirmRemainingMs: 0, holder: { session: 's', client: null } } }).test.holder).toBeNull()
  })
})

describe('reachAfter', () => {
  it('one failed poll is a blip; the second in a row is the takeover; an answer clears it', () => {
    let r = reachAfter(reachable, false)
    expect(r.down).toBe(false)
    for (let i = 1; i < FAILURE_THRESHOLD; i++) r = reachAfter(r, false)
    expect(r.down).toBe(true)
    expect(reachAfter(r, true)).toEqual(reachable)
  })
  it('an answer between failures resets the count', () => {
    expect(reachAfter(reachAfter(reachAfter(reachable, false), true), false).down).toBe(false)
  })
})

describe('otherTest', () => {
  const test = { active: true, remainingMs: 1000, holder: { session: 'editor-me', client: null } }
  it('hides the test this tab holds and shows anyone else’s', () => {
    expect(otherTest(test, 'editor-me')).toBeNull()
    expect(otherTest(test, 'editor-you')).toBe(test)
    expect(otherTest({ ...test, active: false }, 'editor-you')).toBeNull()
  })
})

describe('draftShellNote', () => {
  it('words each refusal by its code; too large is not a shell row', () => {
    expect(draftShellNote('too_many_drafts')).toBe(TOO_MANY_DRAFTS_MESSAGE)
    expect(draftShellNote('invalid_session')).toBe(CHECK_FAILED_MESSAGE)
    expect(draftShellNote('invalid_body')).toBe(CHECK_FAILED_MESSAGE)
    expect(draftShellNote('http_500')).toBe(CHECK_FAILED_MESSAGE)
    expect(draftShellNote('draft_too_large')).toBeNull()
    expect(draftShellNote(null)).toBeNull()
  })
})

describe('openFailedNote', () => {
  it('words the row by cause, with the title', () => {
    expect(openFailedNote('not_found', 'Rainbow')).toBe('Rainbow no longer exists.')
    expect(openFailedNote('unreadable', 'Rainbow')).toBe("Rainbow's file can't be read.")
    expect(openFailedNote('other', 'Rainbow')).toBe("Couldn't open the editor.")
  })
  it('the cause comes from the status and the body code together', () => {
    expect(openFailureCause(404, 'unknown_effect')).toBe('not_found')
    expect(openFailureCause(422, 'unreadable_effect')).toBe('unreadable')
    for (const [s, c] of [[404, ''], [404, 'other'], [500, 'unreadable_effect'], [503, ''], [null, null]] as const) expect(openFailureCause(s, c)).toBe('other')
  })
})
