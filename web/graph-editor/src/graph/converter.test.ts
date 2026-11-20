import { describe, expect, it } from 'vitest'
import { insertConverter } from './connection'
import { COLUMN_WIDTH, estimateHeight, positionsFor } from './layout'
import type { Catalog, GraphDoc, NodeTypeInfo } from './types'

const port = (name: string, type: string) => ({ name, type, description: '', required: true })
const base = { group: 'Numbers', summary: '', tip: '', purpose: '', useWhen: '', example: '', cost: '' }
const types: NodeTypeInfo[] = [
  { ...base, type: 'lfo', title: 'LFO', inputs: [], outputs: [port('value', 'Float')], params: [] },
  { ...base, type: 'angle.constant', title: 'Angle', inputs: [], outputs: [port('angle', 'Angle')], params: [] },
  { ...base, type: 'hue', title: 'Hue', inputs: [port('hue', 'Angle'), port('amount', 'Float')], outputs: [port('color', 'Color')], params: [] },
  { ...base, type: 'angle.fromFloat', title: 'Float to Angle', inputs: [port('value', 'Float')], outputs: [port('angle', 'Angle')], params: [{ name: 'scale', kind: 'float', description: '', default: 360 }] },
  { ...base, type: 'angle.toFloat', title: 'Angle to Float', inputs: [port('angle', 'Angle')], outputs: [port('value', 'Float')], params: [{ name: 'scale', kind: 'float', description: '', default: 360 }] },
]
const catalog: Catalog = new Map(types.map((t) => [t.type, t]))
const doc = (): GraphDoc => ({
  version: 1,
  nodes: [{ id: 'wobble', type: 'lfo' }, { id: 'turn', type: 'angle.constant' }, { id: 'hue', type: 'hue' }],
  edges: [],
  ui: { wobble: { x: 0, y: 0 }, turn: { x: 0, y: 200 }, hue: { x: 300, y: 0 } },
} as GraphDoc)

describe('insertConverter', () => {
  it('puts angle.fromFloat between a Float output and an Angle input', () => {
    const r = insertConverter(doc(), catalog, { source: 'wobble', sourceHandle: 'value', target: 'hue', targetHandle: 'hue' })
    if (!('doc' in r)) throw new Error(r.reason)
    expect(r.doc.nodes.find((n) => n.id === r.id)?.type).toBe('angle.fromFloat')
    expect(r.doc.edges).toEqual([['wobble.value', `${r.id}.value`], [`${r.id}.angle`, 'hue.hue']])
  })

  it('puts angle.toFloat between an Angle output and a Float input', () => {
    const r = insertConverter(doc(), catalog, { source: 'turn', sourceHandle: 'angle', target: 'hue', targetHandle: 'amount' })
    if (!('doc' in r)) throw new Error(r.reason)
    expect(r.doc.nodes.find((n) => n.id === r.id)?.type).toBe('angle.toFloat')
    expect(r.doc.edges).toEqual([['turn.angle', `${r.id}.angle`], [`${r.id}.value`, 'hue.amount']])
  })

  it('places the converter clear of every node', () => {
    const r = insertConverter(doc(), catalog, { source: 'wobble', sourceHandle: 'value', target: 'hue', targetHandle: 'hue' })
    if (!('doc' in r)) throw new Error(r.reason)
    const pos = positionsFor(r.doc, catalog)
    const me = pos[r.id]
    for (const n of r.doc.nodes) {
      if (n.id === r.id) continue
      const o = pos[n.id]
      const w = COLUMN_WIDTH - 20
      const overlap =
        me.x < o.x + w && o.x < me.x + w &&
        me.y < o.y + estimateHeight(r.doc, catalog, n.id) && o.y < me.y + estimateHeight(r.doc, catalog, r.id)
      expect(overlap).toBe(false)
    }
  })

  it('refuses when the input is taken, and reports unknown ports', () => {
    const taken = { ...doc(), edges: [['turn.angle', 'hue.hue']] } as GraphDoc
    const r = insertConverter(taken, catalog, { source: 'wobble', sourceHandle: 'value', target: 'hue', targetHandle: 'hue' })
    expect(r).toEqual({ reason: 'this input already has a connection' })
    const other = insertConverter(doc(), catalog, { source: 'wobble', sourceHandle: 'value', target: 'wobble', targetHandle: 'nope' })
    expect(other).toEqual({ reason: 'unknown port' })
  })
})
