import { describe, expect, it } from 'vitest'
import { LAST_STAGE, pickStage, stageAttrs, type TitleSize } from './barStage'

// A bar as numbers: room left for the title at stage 0, plus what each stage gives back
// (Dashboard label 64, Test label 46, chip text 49, from docs/log/2026-11-15-u8jx9-narrow-bar-mock.md).
const GIVES = [0, 64, 46, 49]
function bar(room: number, want = 200, gives = GIVES) {
  return (stage: number): TitleSize => {
    const back = gives.slice(0, stage + 1).reduce((a, b) => a + b, 0)
    return { actual: Math.min(want, Math.max(0, room + back)), want }
  }
}

describe('pickStage (Aurora-z5y5)', () => {
  it('keeps every label while the title has its 100 px', () => {
    expect(pickStage(bar(100))).toBe(0)
    expect(pickStage(bar(300))).toBe(0)
  })

  it('drops Dashboard first, then Test, then the chip text', () => {
    expect(pickStage(bar(99))).toBe(1)
    expect(pickStage(bar(100 - 64))).toBe(1)
    expect(pickStage(bar(100 - 64 - 1))).toBe(2)
    expect(pickStage(bar(100 - 64 - 46))).toBe(2)
    expect(pickStage(bar(100 - 64 - 46 - 1))).toBe(3)
  })

  it('stops at the last stage when nothing fits', () => {
    expect(pickStage(bar(-500))).toBe(LAST_STAGE)
  })

  it('a title that wants less than 100 px is not a reason to collapse', () => {
    expect(pickStage(bar(40, 40))).toBe(0)
  })

  it('skips a control that is absent (its stage gives nothing back)', () => {
    // No chip: stage 3 gives 0, so the pick is the same as stage 2 would be.
    expect(pickStage(bar(100 - 64 - 46 - 1, 200, [0, 64, 46, 0]))).toBe(LAST_STAGE)
    expect(pickStage(bar(100 - 64 - 46, 200, [0, 64, 46, 0]))).toBe(2)
  })

  it('depends only on the measurements, so a sweep up and down gives the same stages', () => {
    const widths = [400, 300, 200, 150, 100, 60, 20, -40, 20, 60, 100, 150, 200, 300, 400]
    const down = widths.map((w) => pickStage(bar(w)))
    const again = widths.map((w) => pickStage(bar(w)))
    expect(again).toEqual(down)
    expect(pickStage(bar(20))).toBe(pickStage(bar(20)))
  })
})

describe('stageAttrs', () => {
  it('turns on the first n attributes', () => {
    expect(stageAttrs(0)).toEqual({ 'data-back-icon': undefined, 'data-test-icon': undefined, 'data-chip-compact': undefined })
    expect(stageAttrs(2)).toEqual({ 'data-back-icon': 'true', 'data-test-icon': 'true', 'data-chip-compact': undefined })
    expect(stageAttrs(3)['data-chip-compact']).toBe('true')
  })
})
