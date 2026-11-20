import { describe, expect, it } from 'vitest'
import { needsReopen } from './useDraftLoop'

describe('needsReopen (Aurora-ookv)', () => {
  it('matches the server refusal for a source the stream did not open', () => {
    expect(needsReopen('the draft now needs an audio input the preview did not open; reconnect the preview')).toBe(true)
    expect(needsReopen('the draft now needs a video input the preview did not open; reconnect the preview')).toBe(true)
  })
  it('leaves other reload failures alone', () => {
    expect(needsReopen('graph has a cycle')).toBe(false)
    expect(needsReopen(undefined)).toBe(false)
  })
})
