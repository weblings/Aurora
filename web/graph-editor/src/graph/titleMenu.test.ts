import { describe, expect, it } from 'vitest'
import { openGroups, startPoints } from './titleMenu'
import { BLANK_ID } from './save'
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
  it('Open groups Custom then Built-in, skipping the open effect', () => {
    const groups = openGroups(effects, 'mine')
    expect(groups.map((g) => g.name)).toEqual(['Custom', 'Built-in'])
    expect(groups[0].items).toEqual([{ id: 'other', title: 'other' }])
    expect(groups[1].items.map((i) => i.id)).toEqual(['builtin.video', 'builtin.audio'])
  })
  it('Open leaves out an empty group', () => {
    expect(openGroups(effects.filter((x) => x.builtin), 'builtin.video').map((g) => g.name)).toEqual(['Built-in'])
  })
})
