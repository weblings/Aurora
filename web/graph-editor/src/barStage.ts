import { useLayoutEffect, useState } from 'react'

// The header's collapse stages (Aurora-z5y5). Stage n sets the first n attributes on the bar and
// editor.css does the rest: 1 Dashboard to its arrow, 2 idle Test to its icon, 3 the chip to its count.
// The title floor is the owner's "about 100 px" (docs/log/2026-11-15-u8jx9-narrow-bar-mock.md).
export const TITLE_MIN = 100
export const STAGE_ATTRS = ['data-back-icon', 'data-test-icon', 'data-chip-compact'] as const
export const LAST_STAGE = STAGE_ATTRS.length

export type TitleSize = { actual: number; want: number }

// The first stage at which the title still gets min(floor, what it wants), else the last stage.
// Pure: it depends only on what measure reports, so it cannot flip-flop and needs no hysteresis.
export function pickStage(measure: (stage: number) => TitleSize, floor = TITLE_MIN, last = LAST_STAGE): number {
  for (let stage = 0; stage < last; stage++) {
    const { actual, want } = measure(stage)
    if (actual >= Math.min(floor, want)) return stage
  }
  return last
}

export function stageAttrs(stage: number): Record<string, string | undefined> {
  return Object.fromEntries(STAGE_ATTRS.map((attr, i) => [attr, stage > i ? 'true' : undefined]))
}

function applyStage(bar: HTMLElement, stage: number) {
  STAGE_ATTRS.forEach((attr, i) => (stage > i ? bar.setAttribute(attr, 'true') : bar.removeAttribute(attr)))
}

// Tries each stage on the real bar (synchronously, before paint) and keeps the first that fits.
export function useBarStage(bar: HTMLElement | null): number {
  const [stage, setStage] = useState(0)
  useLayoutEffect(() => {
    if (!bar) return
    let now = 0
    const measure = (s: number): TitleSize => {
      applyStage(bar, s)
      const title = bar.querySelector<HTMLElement>('.editor-title-menu')
      if (!title) return { actual: Infinity, want: 0 }
      const text = title.querySelector<HTMLElement>('.editor-title-label')
      const cap = parseFloat(getComputedStyle(title).maxWidth)
      const actual = title.getBoundingClientRect().width
      // What the title wants: its width plus what its text is clipped by, up to its own max-width.
      const want = Math.min(actual + (text ? Math.max(0, text.scrollWidth - text.clientWidth) : 0), Number.isFinite(cap) ? cap : Infinity)
      return { actual, want }
    }
    const decide = () => {
      const next = pickStage(measure)
      applyStage(bar, next)
      if (next !== now) {
        now = next
        setStage(next)
      }
    }
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(decide)
    })
    ro.observe(bar)
    for (const el of bar.querySelectorAll('.editor-title-menu, .editor-bar-end')) ro.observe(el)
    decide()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [bar])
  return stage
}
