import { describe, expect, it } from 'vitest'
import { SECTIONS_KEY } from '../../../ui/TuningControls.js'
import { moveControlInSection, type Control } from './controls'
import { cardMenu, dropControl, dropSection, effectiveLabel, moveSection, moveToNewSection, sectionMenu, sourceLine } from './tuningCards'
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
  it('moves an empty section to the top and back down', () => {
    const st = { controls, ui: { [SECTIONS_KEY]: ['One', 'Empty', 'Two'] } }
    expect(moveSection(st, 'Empty', 1).ui?.[SECTIONS_KEY]).toEqual(['One', 'Two', 'Empty'])
    expect(sectionMenu(st.controls, st.ui, 'Empty')).toEqual({ canUp: true, canDown: true })
    const top = moveSection(st, 'Empty', -1)
    expect(top.ui?.[SECTIONS_KEY]).toEqual(['Empty', 'One', 'Two'])
    expect(sectionMenu(top.controls, top.ui, 'Empty')).toEqual({ canUp: false, canDown: true })
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

describe('drops', () => {
  const controls = [c('a', 'One'), c('b', 'One'), c('d', 'Two'), c('e')]
  const st = { controls, ui: undefined }
  const order = (s: { controls: Control[] }) => s.controls.map((k) => `${k.section ?? ''}/${k.param}`)
  const at = (param: string) => ({ node: 'n', param })
  const on = (param: string) => ({ card: at(param) })
  it('puts a card between cards of another section, or on a heading at its end', () => {
    expect(order(dropControl(st, at('a'), on('d'), 'before'))).toEqual(['One/b', 'Two/a', 'Two/d', '/e'])
    expect(order(dropControl(st, at('e'), on('a'), 'after'))).toEqual(['One/a', 'One/e', 'One/b', 'Two/d'])
    expect(order(dropControl(st, at('a'), { heading: 'Two' }, 'on'))).toEqual(['One/b', 'Two/d', 'Two/a', '/e'])
    expect(order(dropControl(st, at('a'), { heading: '' }, 'on'))).toEqual(['One/b', 'Two/d', '/e', '/a'])
  })
  it('ignores a card dropped on itself, on a card, or beside a heading', () => {
    expect(dropControl(st, at('a'), on('a'), 'after')).toBe(st)
    expect(dropControl(st, at('a'), on('b'), 'on')).toBe(st)
    expect(dropControl(st, at('a'), { heading: 'Two' }, 'before')).toBe(st)
  })
  it('drops a card into an empty section and keeps others empty', () => {
    const e = { controls, ui: { [SECTIONS_KEY]: ['One', 'Two', 'Void', 'Void2'] } }
    const next = dropControl(e, at('d'), { heading: 'Void' }, 'on')
    expect(next.controls.find((k) => k.param === 'd')?.section).toBe('Void')
    expect(next.ui?.[SECTIONS_KEY]).toEqual(['One', 'Two', 'Void', 'Void2'])
  })
  it('reorders sections among headings only, with General last', () => {
    expect(order(dropSection(st, 'Two', 'One', 'before'))).toEqual(['Two/d', 'One/a', 'One/b', '/e'])
    expect(order(dropSection(st, 'One', 'Two', 'after'))).toEqual(['Two/d', 'One/a', 'One/b', '/e'])
    expect(dropSection(st, 'One', 'Two', 'before')).toBe(st)
    expect(dropSection(st, 'One', 'One', 'after')).toBe(st)
    expect(dropSection(st, 'One', 'Two', 'on')).toBe(st)
    expect(dropSection(st, 'One', '', 'after')).toBe(st)
    expect(dropSection(st, '', 'One', 'before')).toBe(st)
    expect(order(dropSection(st, 'One', '', 'before'))).toEqual(['Two/d', 'One/a', 'One/b', '/e'])
  })
  it('drops an empty section first or last', () => {
    const e = { controls, ui: { [SECTIONS_KEY]: ['One', 'Void', 'Two'] } }
    expect(dropSection(e, 'Void', 'One', 'before').ui?.[SECTIONS_KEY]).toEqual(['Void', 'One', 'Two'])
    expect(dropSection(e, 'Void', 'Two', 'after').ui?.[SECTIONS_KEY]).toEqual(['One', 'Two', 'Void'])
  })
})
