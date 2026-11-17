import { describe, expect, it } from 'vitest'
import { SECTIONS_KEY } from '../../../ui/TuningControls.js'
import {
  addControl, addSection, controlsOf, deleteSection, moveControl, moveControlToSection, regroup, removeControl,
  renameSection, reorderSections, sectionNames, updateControl, withSections, type Control, type SectionState,
} from './controls'
import { copySelection, parseClip, pasteSelection, removeNodes } from './doc'
import { builtinLike, catalog, customLike } from './fixtures'
import { positionsFor } from './layout'
import type { GraphDoc, GraphUi } from './types'

const c = (id: string, section?: string): Control => (section === undefined ? { node: id, param: 'p' } : { node: id, param: 'p', section })
const state = (controls: Control[], ui?: GraphUi): SectionState => ({ controls, ui })
const view = (s: SectionState) => s.controls.map((x) => `${x.section ?? ''}/${x.node}`)

describe('regroup', () => {
  it('joins split runs and moves General last', () => {
    const out = regroup([c('a1', 'A'), c('g1'), c('b1', 'B'), c('a2', 'A')])
    expect(view(state(out))).toEqual(['A/a1', 'A/a2', 'B/b1', '/g1'])
  })
})

describe('section helpers', () => {
  const base = () => state([c('a1', 'A'), c('a2', 'A'), c('b1', 'B'), c('g1')])

  it('moves a control to the end of a section, and out to General', () => {
    expect(view(moveControlToSection(base(), 0, 'B'))).toEqual(['A/a2', 'B/b1', 'B/a1', '/g1'])
    const toGeneral = moveControlToSection(base(), 0, '')
    expect(view(toGeneral)).toEqual(['A/a2', 'B/b1', '/g1', '/a1'])
    expect(toGeneral.controls.at(-1)).toEqual({ node: 'a1', param: 'p' })
  })

  it('keeps a section whose last control left, in the ui key', () => {
    const next = moveControlToSection(base(), 2, 'A')
    expect(next.ui?.[SECTIONS_KEY]).toEqual(['A', 'B'])
    expect(sectionNames(next.controls, next.ui)).toEqual(['A', 'B'])
    // Filling it again drops the key.
    expect(moveControlToSection(next, 0, 'B').ui?.[SECTIONS_KEY]).toBeUndefined()
  })

  it('renames, rejecting blank, taken and General', () => {
    const s = base()
    expect(view(renameSection(s, 'A', ' Color '))).toEqual(['Color/a1', 'Color/a2', 'B/b1', '/g1'])
    expect(renameSection(s, 'A', 'B')).toBe(s)
    expect(renameSection(s, 'A', '  ')).toBe(s)
    expect(renameSection(s, '', 'X')).toBe(s)
  })

  it('renames an empty section in the key', () => {
    const withEmpty = addSection(base(), 'E', 'A')
    expect(withEmpty.ui?.[SECTIONS_KEY]).toEqual(['A', 'E', 'B'])
    expect(renameSection(withEmpty, 'E', 'F').ui?.[SECTIONS_KEY]).toEqual(['A', 'F', 'B'])
  })

  it('deletes a section into General and drops it from the key', () => {
    const withEmpty = addSection(base(), 'E')
    const next = deleteSection(withEmpty, 'A')
    expect(view(next)).toEqual(['B/b1', '/g1', '/a1', '/a2'])
    expect(next.ui?.[SECTIONS_KEY]).toEqual(['B', 'E'])
    expect(deleteSection(next, 'E').ui?.[SECTIONS_KEY]).toBeUndefined()
  })

  it('adds a section after another or last, and ignores blank or taken names', () => {
    expect(addSection(base(), 'E').ui?.[SECTIONS_KEY]).toEqual(['A', 'B', 'E'])
    expect(addSection(base(), 'E', 'A').ui?.[SECTIONS_KEY]).toEqual(['A', 'E', 'B'])
    const s = base()
    expect(addSection(s, 'A')).toBe(s)
    expect(addSection(s, ' ')).toBe(s)
  })

  it('reorders sections and writes the controls in that order', () => {
    expect(view(reorderSections(base(), ['B', 'A']))).toEqual(['B/b1', 'A/a1', 'A/a2', '/g1'])
    expect(view(reorderSections(base(), ['B']))).toEqual(['B/b1', 'A/a1', 'A/a2', '/g1'])
    const empty = addSection(base(), 'E', 'A')
    expect(reorderSections(empty, ['E', 'B', 'A']).ui?.[SECTIONS_KEY]).toEqual(['E', 'B', 'A'])
  })

  it('does not mutate its input', () => {
    const s = base()
    const snap = JSON.stringify(s)
    moveControlToSection(s, 0, 'B')
    renameSection(s, 'A', 'Z')
    deleteSection(s, 'A')
    addSection(s, 'E')
    reorderSections(s, ['B'])
    expect(JSON.stringify(s)).toBe(snap)
  })
})

describe('doc edits write the regrouped array', () => {
  const doc = (): GraphDoc => ({ ...builtinLike(), controls: [c('gain', 'A'), c('rescale', 'B')] })

  it('adds to General without label or section, after the named sections', () => {
    const next = addControl(doc(), 'cap', 'q')
    expect(next.controls).toEqual([c('gain', 'A'), c('rescale', 'B'), { node: 'cap', param: 'q' }])
  })

  it('regroups after an edit but not on open', () => {
    const split = { ...builtinLike(), controls: [c('x', ''), c('gain', 'A'), c('rescale', 'B'), c('y', 'A')] }
    const next = updateControl(split, 1, { label: 'Hi' })
    expect(controlsOf(next).map((x) => x.node)).toEqual(['gain', 'y', 'rescale', 'x'])
    expect(split.controls.map((x) => x.node)).toEqual(['x', 'gain', 'rescale', 'y'])
  })

  it('removing the last control of a section keeps the section', () => {
    const next = removeControl(doc(), 0)
    expect(next.ui?.[SECTIONS_KEY]).toEqual(['A', 'B'])
    expect(moveControl(doc(), 0, 1).controls).toEqual([c('gain', 'A'), c('rescale', 'B')])
  })

  it('withSections writes controls and ui, and leaves ui absent when there is none', () => {
    const next = withSections(doc(), addSection(state(controlsOf(doc()), doc().ui), 'E'))
    expect(next.ui?.[SECTIONS_KEY]).toEqual(['A', 'B', 'E'])
    expect('ui' in withSections({ nodes: [], edges: [] }, state([c('a')]))).toBe(false)
  })
})

describe("the '#sections' key is not a node", () => {
  const withKey = (): GraphDoc => ({
    ...customLike(),
    ui: { cap: { x: 100, y: 50 }, [SECTIONS_KEY]: ['Empty'] },
    controls: [c('rescale', 'A')],
    nodes: [{ id: 'cap', type: 'video.capture', params: {} }, { id: 'rescale', type: 'image.rescale', params: {} }],
    edges: [],
  })

  it('survives removing nodes', () => {
    expect(removeNodes(withKey(), new Set(['cap', 'rescale'])).ui).toEqual({ [SECTIONS_KEY]: ['A', 'Empty'] })
  })

  it('is not copied into the clipboard, and a clip carrying it pastes nothing from it', () => {
    const clip = copySelection(withKey(), new Set(['cap']))
    expect(clip.ui).toEqual({ cap: { x: 100, y: 50 } })
    const forged = parseClip(JSON.stringify({ ...clip, ui: { ...clip.ui, [SECTIONS_KEY]: ['x'] } }))
    expect(forged?.ui).toEqual({ cap: { x: 100, y: 50 } })
  })

  it('pastes without touching the key', () => {
    const clip = copySelection(withKey(), new Set(['cap']))
    expect(pasteSelection(withKey(), clip, { x: 0, y: 0 }, catalog).doc.ui?.[SECTIONS_KEY]).toEqual(['Empty'])
  })

  it('is not a node position for layout', () => {
    const positions = positionsFor(withKey(), catalog)
    expect(Object.keys(positions).sort()).toEqual(['cap', 'rescale'])
  })
})
