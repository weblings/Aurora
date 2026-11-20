import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { announceQueue } from './Announcer'

describe('announceQueue', () => {
  let seen: string[]
  let queue: ReturnType<typeof announceQueue>

  beforeEach(() => {
    vi.useFakeTimers()
    seen = []
    queue = announceQueue((text) => seen.push(text))
  })
  afterEach(() => {
    queue.dispose()
    vi.useRealTimers()
  })

  it('empties the region, then fills it 50 ms later and clears it after 10 s', () => {
    queue.announce('Saved')
    expect(seen).toEqual([''])
    vi.advanceTimersByTime(50)
    expect(seen).toEqual(['', 'Saved'])
    vi.advanceTimersByTime(10_000)
    expect(seen).toEqual(['', 'Saved', ''])
  })

  // Aurora-4ccg: the test-ended message and the shell's new row arrive in the same poll.
  it('speaks two messages asked for inside the 50 ms together, in order, dropping neither', () => {
    queue.announce('Test ended: an agent took the lights')
    vi.advanceTimersByTime(20)
    queue.announce('An agent is testing an effect on the lights.')
    vi.advanceTimersByTime(50)
    expect(seen.at(-1)).toBe('Test ended: an agent took the lights An agent is testing an effect on the lights.')
  })

  it('speaks a message after the fill on its own, and the same text twice is a change', () => {
    queue.announce('Added Gain')
    vi.advanceTimersByTime(50)
    queue.announce('Added Gain')
    vi.advanceTimersByTime(50)
    expect(seen).toEqual(['', 'Added Gain', '', 'Added Gain'])
  })

  it('says nothing after dispose', () => {
    queue.announce('Saved')
    queue.dispose()
    vi.advanceTimersByTime(20_000)
    expect(seen).toEqual([''])
  })
})
