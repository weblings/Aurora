import { describe, expect, it } from 'vitest'
import { addGroups, searchNodes } from './addMenu'
import type { Catalog, NodeTypeInfo } from './types'

const base = { summary: '', tip: '', purpose: '', useWhen: '', example: '', cost: '', inputs: [], outputs: [], params: [] }
const node = (type: string, title: string, group: string, extra: Partial<NodeTypeInfo> = {}): NodeTypeInfo => ({ ...base, type, title, group, ...extra })
const catalog: Catalog = new Map(
  [
    node('frame.gain', 'Gain', 'Lights', { purpose: 'Scales brightness' }),
    node('audio.bounce', 'Bounce', 'Audio', { summary: 'Reacts to the beat, gain free' }),
    node('video.capture', 'Screen capture', 'Sources'),
    node('x.odd', 'Odd', ''),
    node('x.new', 'New', 'Brandnew'),
  ].map((n) => [n.type, n]),
)

describe('addGroups', () => {
  it('orders known groups by signal flow, then others, with a fallback', () => {
    expect(addGroups(catalog).map((g) => g.name)).toEqual(['Sources', 'Audio', 'Lights', 'Brandnew', 'Other'])
  })
})

describe('searchNodes', () => {
  it('ranks name matches before description matches', () => {
    const r = searchNodes(catalog, 'gain')
    expect(r.byName.map((n) => n.type)).toEqual(['frame.gain'])
    expect(r.byText.map((n) => n.type)).toEqual(['audio.bounce'])
  })
  it('matches the type id and ignores case and padding', () => {
    expect(searchNodes(catalog, '  FRAME.').byName.map((n) => n.type)).toEqual(['frame.gain'])
  })
  it('returns nothing for an empty query', () => {
    expect(searchNodes(catalog, ' ')).toEqual({ byName: [], byText: [] })
  })
})
