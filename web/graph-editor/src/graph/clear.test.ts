import { describe, expect, it } from 'vitest'
import { clearShift } from './clear'

describe('clearShift', () => {
  it('does nothing when the node is already clear', () => {
    expect(clearShift(100, 300, 700)).toBe(0)
    expect(clearShift(100, 684, 700)).toBe(0)
  })
  it('pans just enough to leave the margin', () => {
    expect(clearShift(400, 600, 500)).toBe(-116)
  })
  it('stops when the node start reaches the margin', () => {
    expect(clearShift(100, 600, 300)).toBe(-84)
  })
  it('does not pan the other way for a node left of the limit', () => {
    expect(clearShift(-50, 100, 500)).toBe(0)
  })
  it('does nothing if the start is already past the margin and the end is not clear', () => {
    expect(clearShift(10, 600, 300)).toBe(0)
  })
})
