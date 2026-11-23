import { describe, expect, it } from 'vitest'
import { halfDashes, halfPath, roundedPerimeter } from './dashFit'

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

describe('roundedPerimeter', () => {
  it('is a plain rectangle with no radius and a circle with a full one', () => {
    expect(roundedPerimeter(100, 50, 0)).toBe(300)
    expect(roundedPerimeter(100, 100, 50)).toBeCloseTo(2 * Math.PI * 50)
  })
})

describe('halfPath', () => {
  it('runs from top centre to bottom centre through the right corners', () => {
    expect(halfPath(200, 100, 16)).toBe('M 100 0 H 184 A 16 16 0 0 1 200 16 V 84 A 16 16 0 0 1 184 100 H 100')
  })
})

describe('halfDashes', () => {
  it('fills half the outline exactly, in dash and gap pairs', () => {
    for (const [w, h] of [[640, 320], [301, 187], [150, 100]]) {
      const got = halfDashes(w, h, 16, 22, 14, 11)!
      expect(got).not.toBeNull()
      expect(got.length % 2).toBe(0)
      expect(sum(got)).toBeCloseTo(roundedPerimeter(w, h, 16) / 2, 9)
      expect(got.slice(1).every((n) => n > 0)).toBe(true)
    }
  })

  it('wraps both corners in one dash of the same length', () => {
    const corner = 22 + (Math.PI * 16) / 2
    const got = halfDashes(640, 320, 16, 22, 14, 11)!
    expect(got.filter((n) => Math.abs(n - corner) < 1e-9)).toHaveLength(2)
  })

  it('opens and closes on half a gap, so the mirrored halves meet on a whole one', () => {
    const got = halfDashes(640, 320, 16, 22, 14, 11)!
    expect(got[0]).toBe(0)
    expect(got[1]).toBeCloseTo(got[got.length - 1], 9)
  })

  it('keeps the dashes between corners close to the wanted length', () => {
    const got = halfDashes(640, 320, 16, 22, 14, 11)!
    const dashes = got.filter((_, i) => i % 2 === 0 && i > 0).filter((n) => n < 40)
    for (const d of dashes) expect(Math.abs(d - 22)).toBeLessThan(6)
  })

  it('gives up on a box too small for a gap between the corners', () => {
    expect(halfDashes(50, 50, 16, 22, 14, 11)).toBeNull()
  })
})
