import { describe, expect, it } from 'vitest'
import { openGroups, startGroups, startPoints } from './titleMenu'
import { BLANK_ID, copyOf } from './save'
import type { EffectListEntry } from './types'

const e = (id: string, title: string, builtin: boolean): EffectListEntry => ({ id, title, builtin, description: null })
const effects = [e('mine', 'Mine', false), e('builtin.video', 'Video', true), e('builtin.audio', 'Music pulse', true), e('other', '', false)]

describe('title menu lists', () => {
  it('New offers Empty then the built-ins, as the dashboard does', () => {
    expect(startPoints(effects, true).map((s) => s.id)).toEqual([BLANK_ID, 'builtin.video', 'builtin.audio'])
  })
  it('New drops Music pulse without audio', () => {
    expect(startPoints(effects, false).map((s) => s.id)).toEqual([BLANK_ID, 'builtin.video'])
  })
  it('New puts custom and hidden effects in their own sub-menus, in the server order', () => {
    const list = [
      { ...e('b', 'B', false), order: 2 },
      { ...e('a', 'A', false), order: 1 },
      { ...e('h', 'Hid', false), hidden: true, order: 3 },
      { ...e('builtin.video', 'Video', true), hidden: true, order: 0 },
    ]
    const groups = startGroups(list, true)
    expect(groups.map((g) => g.name)).toEqual(['Custom', 'Hidden'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['h'])
  })
  it('New leaves out an empty sub-menu', () => {
    expect(startGroups(effects.filter((x) => x.builtin), true)).toEqual([])
  })
  it('a New or Duplicate pick is the source under a distinct title, nothing else changed', () => {
    const src = { version: 1, nodes: [], edges: [], title: 'Mine' } as never
    expect(copyOf(src, 'x', ['Mine'])).toEqual({ version: 1, nodes: [], edges: [], title: 'Mine (Copy)' })
    expect(copyOf(src, 'x', ['Mine', 'Mine (Copy)'])).toMatchObject({ title: 'Mine (Copy 2)' })
  })
  it('a built-in has no title in its graph, so the list title is copied', () => {
    const src = { version: 1, nodes: [], edges: [] } as never
    expect(copyOf(src, 'Screen colors', ['Screen colors'])).toMatchObject({ title: 'Screen colors (Copy)' })
  })
  it('Open groups Custom then Built-in, skipping the open effect', () => {
    const groups = openGroups(effects, 'mine')
    expect(groups.map((g) => g.name)).toEqual(['Custom', 'Built-in'])
    expect(groups[0].items).toEqual([{ id: 'other', title: 'other', unsaved: false }])
    expect(groups[1].items.map((i) => i.id)).toEqual(['builtin.video', 'builtin.audio'])
  })
  it('Open leaves out an empty group', () => {
    expect(openGroups(effects.filter((x) => x.builtin), 'builtin.video').map((g) => g.name)).toEqual(['Built-in'])
  })
  it('Open marks Custom and Built-in effects with a kept copy; Not saved yet carries the * on its heading', () => {
    const doc = { version: 1, nodes: [], edges: [], title: 'Mine, edited' } as never
    const kept = new Map([['other', doc], ['builtin.video', doc], ['@new-abc123', doc], ['@new-zzz999', { ...(doc as object), title: '' } as never], ['gone', doc]])
    const groups = openGroups(effects, 'mine', kept)
    expect(groups.map((g) => [g.name, g.unsaved])).toEqual([['Not saved yet', true], ['Custom', false], ['Built-in', false]])
    expect(groups[0].items).toEqual([
      { id: '@new-abc123', title: 'Mine, edited', unsaved: false },
      { id: '@new-zzz999', title: 'New empty effect', unsaved: false },
    ])
    expect(groups[1].items).toEqual([{ id: 'other', title: 'other', unsaved: true }])
    expect(groups[2].items.map((i) => [i.id, i.unsaved])).toEqual([['builtin.video', true], ['builtin.audio', false]])
  })
  it('Open leaves out the open new effect and never lists the legacy blank id', () => {
    const doc = { version: 1, nodes: [], edges: [], title: 'x' } as never
    const groups = openGroups([], '@new-abc123', new Map([['@new-abc123', doc], ['@empty', doc]]))
    expect(groups).toEqual([])
  })
})
