import { describe, expect, it } from 'vitest'
import { SECTIONS_KEY } from '../../../ui/TuningControls.js'
import { moveControlInSection, type Control } from './controls'
import { cardMenu, effectiveLabel, moveSection, moveToNewSection, sectionMenu, sourceLine } from './tuningCards'
import type { GraphDoc } from './types'

const c = (param: string, section?: string, label?: string): Control => ({ node: 'n', param, ...(section ? { section } : {}), ...(label ? { label } : {}) })

describe('card text', () => {
  it('falls back to the param label for an empty or missing label', () => {
    expect(effectiveLabel(c('a'), 'Gain')).toBe('Gain')
    expect(effectiveLabel({ ...c('a'), label: '  ' }, 'Gain')).toBe('Gain')
    expect(effectiveLabel(c('a', undefined, 'Loud'), 'Gain')).toBe('Loud')
  })
  it('names the param in the source line only when a label hides it', () => {
    expect(sourceLine(c('a'), 'Gain node', 'Gain')).toBe('Gain node')
    expect(sourceLine(c('a', undefined, 'Loud'), 'Gain node', 'Gain')).toBe('Gain node · Gain')
  })
})

describe('card menu rules', () => {
  const controls = [c('a', 'One'), c('b', 'One'), c('c', 'Two'), c('d')]
  it('keeps Move up and Down inside the section', () => {
    expect(cardMenu(controls, undefined, controls[0])).toMatchObject({ canUp: false, canDown: true })
    expect(cardMenu(controls, undefined, controls[1])).toMatchObject({ canUp: true, canDown: false })
    expect(cardMenu(controls, undefined, controls[2])).toMatchObject({ canUp: false, canDown: false })
  })
  it('lists the other sections, General last, and none when the graph is flat', () => {
    expect(cardMenu(controls, undefined, controls[0]).sections).toEqual(['Two', ''])
    expect(cardMenu(controls, undefined, controls[3]).sections).toEqual(['One', 'Two'])
    expect(cardMenu([c('a'), c('b')], undefined, c('a')).sections).toEqual([])
  })
  it('lists an empty stored section', () => {
    const flat = [c('a')]
    expect(cardMenu(flat, { [SECTIONS_KEY]: ['Later'] }, flat[0]).sections).toEqual(['Later'])
  })
})

describe('moveControlInSection', () => {
  const doc = { nodes: [], edges: [], controls: [c('a', 'One'), c('x', 'Two'), c('b', 'One')] } as unknown as GraphDoc
  it('swaps with the neighbour in the same section', () => {
    const next = moveControlInSection(doc, 0, 1)
    expect((next.controls as Control[]).map((k) => k.param)).toEqual(['b', 'a', 'x'])
  })
  it('does nothing at the section edge', () => {
    expect(moveControlInSection(doc, 2, 1)).toBe(doc)
  })
})

describe('section menu and moves', () => {
  const controls = [c('a', 'One'), c('b', 'Two'), c('d')]
  const names = (st: { controls: Control[] }) => [...new Set(st.controls.map((k) => k.section ?? ''))]
  it('disables Move up on the first and Move down on the last named section', () => {
    expect(sectionMenu(controls, undefined, 'One')).toEqual({ canUp: false, canDown: true })
    expect(sectionMenu(controls, undefined, 'Two')).toEqual({ canUp: true, canDown: false })
  })
  it('swaps neighbours, keeping General last, and ignores the edges', () => {
    const st = { controls, ui: undefined }
    expect(names(moveSection(st, 'One', 1))).toEqual(['Two', 'One', ''])
    expect(moveSection(st, 'One', -1)).toBe(st)
  })
  it('moves an empty section down but never to the top', () => {
    const st = { controls, ui: { [SECTIONS_KEY]: ['One', 'Empty', 'Two'] } }
    expect(moveSection(st, 'Empty', 1).ui?.[SECTIONS_KEY]).toEqual(['One', 'Two', 'Empty'])
    expect(sectionMenu(st.controls, st.ui, 'Empty')).toEqual({ canUp: false, canDown: true })
    expect(moveSection(st, 'Empty', -1)).toBe(st)
  })
  it('creates the section and moves the control into it', () => {
    const next = moveToNewSection({ controls, ui: undefined }, 'n', 'd', 'Fresh')
    expect(next.controls.find((k) => k.param === 'd')?.section).toBe('Fresh')
    expect(next.ui?.[SECTIONS_KEY]).toBeUndefined()
  })
  it('refuses a taken name', () => {
    const st = { controls, ui: undefined }
    expect(moveToNewSection(st, 'n', 'd', 'One')).toBe(st)
  })
})
