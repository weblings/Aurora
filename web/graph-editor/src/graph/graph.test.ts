import { describe, expect, it } from 'vitest'
import { refuseConnection, type Connection } from './connection'
import { addEdge, addNode, moveNodes, removeEdge, removeNodes, setParam, splitEndpoint } from './doc'
import { carryViewState, toFlowEdges, toFlowNodes } from './flow'
import { paletteGroups } from './palette'
import { editorReducer, emptyEditor } from './history'
import { columnLayout, positionsFor } from './layout'
import { addStop, clampStopPos, effectiveValue } from '../ParamWidget'
import { builtinLike, catalog, customLike } from './fixtures'
import nodesSample from './server-samples/nodes.json'
import type { Catalog, NodeTypeInfo } from './types'

const without = <T extends object>(obj: T, key: string) => {
  const { [key]: _drop, ...rest } = obj as Record<string, unknown>
  return rest
}

describe('flow adapter', () => {
  it('maps nodes and edges to React Flow and back to the same edge list', () => {
    const doc = builtinLike()
    const edges = toFlowEdges(doc)
    expect(edges).toHaveLength(4)
    expect(edges.map((e) => [`${e.source}.${e.sourceHandle}`, `${e.target}.${e.targetHandle}`])).toEqual(doc.edges)
    expect(toFlowNodes(doc, catalog).map((n) => n.id)).toEqual(doc.nodes.map((n) => n.id))
  })

  it('leaves an unknown type renderable with no info', () => {
    const doc = builtinLike()
    doc.nodes.push({ id: 'x', type: 'future.thing' })
    const node = toFlowNodes(doc, catalog).find((n) => n.id === 'x')!
    expect(node.data.info).toBeUndefined()
  })

  it('marks which inputs are fed', () => {
    const gain = toFlowNodes(builtinLike(), catalog).find((n) => n.id === 'gain')!
    expect([...gain.data.connectedInputs]).toEqual(['frame'])
  })

  it('carries selection and measured size across a rebuild', () => {
    const doc = builtinLike()
    const before = toFlowNodes(doc, catalog).map((n) => (n.id === 'gain' ? { ...n, selected: true, measured: { width: 9, height: 9 } } : n))
    const after = carryViewState(before, toFlowNodes(setParam(doc, 'gain', 'gain', 2), catalog))
    const gain = after.find((n) => n.id === 'gain')!
    expect(gain.selected).toBe(true)
    expect(gain.measured).toEqual({ width: 9, height: 9 })
    expect(gain.data.params.gain).toBe(2)
  })
})

describe('carryViewState', () => {
  it('keeps the dragged position only while a drag is in progress', () => {
    const derived = toFlowNodes(builtinLike(), catalog)
    const view = derived.map((n) => ({ ...n, position: { x: 7, y: 8 }, dragging: n.id === 'gain' }))
    const merged = carryViewState(view, derived)
    expect(merged.find((n) => n.id === 'gain')!.position).toEqual({ x: 7, y: 8 })
    expect(merged.find((n) => n.id === 'cap')!.position).toEqual(derived.find((n) => n.id === 'cap')!.position)
  })
})

describe('round trip', () => {
  it('moving nodes changes only ui', () => {
    for (const make of [builtinLike, customLike]) {
      const doc = make()
      const moved = moveNodes(doc, { zones: { x: 5, y: 6 } })
      expect(without(moved, 'ui')).toEqual(without(doc, 'ui'))
      expect(moved.ui?.zones).toEqual({ x: 5, y: 6 })
    }
  })

  it('keeps ui keys that are not node ids', () => {
    const moved = moveNodes(customLike(), { cap: { x: 0, y: 0 } })
    expect(moved.ui).toHaveProperty('viewport')
  })

  it('setParam changes one param and nothing else', () => {
    const doc = builtinLike()
    const next = setParam(doc, 'gain', 'gain', 1.5)
    expect(next.nodes.find((n) => n.id === 'gain')!.params).toEqual({ gain: 1.5 })
    expect(next.nodes.filter((n) => n.id !== 'gain')).toEqual(doc.nodes.filter((n) => n.id !== 'gain'))
    expect(without(next, 'nodes')).toEqual(without(doc, 'nodes'))
  })

  it('does not mutate the document it edits', () => {
    const doc = builtinLike()
    const snapshot = JSON.stringify(doc)
    setParam(doc, 'gain', 'gain', 2)
    moveNodes(doc, { cap: { x: 1, y: 1 } })
    addEdge(doc, ['cap.image', 'x.image'])
    removeNodes(doc, new Set(['zones']))
    expect(JSON.stringify(doc)).toBe(snapshot)
  })

  it('add then remove an edge restores the document', () => {
    const doc = customLike()
    const edge: [string, string] = ['cap.image', 'send.frame']
    expect(removeEdge(addEdge(doc, edge), edge)).toEqual(doc)
  })

  it('removing a node drops its edges and layout entry', () => {
    const next = removeNodes(customLike(), new Set(['zones']))
    expect(next.nodes.map((n) => n.id)).toEqual(['cap', 'send'])
    expect(next.edges).toEqual([])
    expect(next.ui).not.toHaveProperty('zones')
    expect(next.ui).toHaveProperty('cap')
  })

  it('splits an endpoint at the last dot', () => {
    expect(splitEndpoint('a.b.image')).toEqual({ node: 'a.b', port: 'image' })
  })
})

describe('layout', () => {
  it('puts nodes in columns by depth', () => {
    const pos = columnLayout(builtinLike(), catalog)
    const xs = ['cap', 'rescale', 'zones', 'gain', 'send'].map((id) => pos[id].x)
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
    expect(new Set(xs).size).toBe(5)
  })

  it('stacks nodes of one depth without overlap', () => {
    const doc = builtinLike()
    doc.nodes.push({ id: 'cap2', type: 'video.capture' })
    const pos = columnLayout(doc, catalog)
    expect(pos.cap2.x).toBe(pos.cap.x)
    expect(pos.cap2.y).toBeGreaterThan(pos.cap.y)
  })

  it('terminates on a cycle', () => {
    const doc = builtinLike()
    doc.edges.push(['gain.frame', 'gain.frame'])
    expect(Object.keys(columnLayout(doc, catalog))).toHaveLength(5)
  })

  it('prefers saved positions and lays out the rest', () => {
    const doc = customLike()
    delete doc.ui!.zones
    const pos = positionsFor(doc, catalog)
    expect(pos.cap).toEqual({ x: 40, y: 80 })
    expect(pos.zones).toEqual(columnLayout(doc, catalog).zones)
  })
})

describe('refuseConnection', () => {
  const conn = (s: string, sp: string, t: string, tp: string): Connection => ({
    source: s, sourceHandle: sp, target: t, targetHandle: tp,
  })

  it('allows a matching, free connection', () => {
    const doc = customLike()
    doc.edges = []
    expect(refuseConnection(doc, catalog, conn('cap', 'image', 'zones', 'image'))).toBeNull()
  })

  it('refuses a port-type mismatch', () => {
    expect(refuseConnection(customLike(), catalog, conn('cap', 'image', 'send', 'frame'))).toMatch(/Image output cannot feed a Frame/)
  })

  it('refuses a second edge into one input', () => {
    const doc = builtinLike()
    doc.nodes.push({ id: 'cap2', type: 'video.capture' })
    expect(refuseConnection(doc, catalog, conn('cap2', 'image', 'rescale', 'image'))).toMatch(/already has a connection/)
  })

  it('refuses a cycle, including a self loop', () => {
    const doc = builtinLike()
    doc.nodes.push({ id: 'gain2', type: 'frame.gain' })
    doc.edges.push(['gain.frame', 'gain2.frame'])
    expect(refuseConnection(doc, catalog, conn('gain2', 'frame', 'gain', 'frame'))).toMatch(/already has/)
    doc.edges = doc.edges.filter((e) => e[1] !== 'gain.frame')
    expect(refuseConnection(doc, catalog, conn('gain2', 'frame', 'gain', 'frame'))).toMatch(/cycle/)
    expect(refuseConnection(doc, catalog, conn('gain', 'frame', 'gain', 'frame'))).toMatch(/cycle/)
  })

  it('refuses a second sender to one output', () => {
    const doc = builtinLike()
    doc.nodes.push({ id: 'send2', type: 'output.send', params: { output: 'hue' } }, { id: 'gain2', type: 'frame.gain' })
    expect(refuseConnection(doc, catalog, conn('gain', 'frame', 'send2', 'frame'))).toMatch(/already sent by 'send'/)
  })

  it('allows a sender to a different output', () => {
    const doc = builtinLike()
    doc.nodes.push({ id: 'send2', type: 'output.send', params: { output: 'strip' } })
    expect(refuseConnection(doc, catalog, conn('gain', 'frame', 'send2', 'frame'))).toBeNull()
  })

  it('uses the registry default when the sender leaves its output unset', () => {
    const doc = builtinLike()
    doc.nodes.push({ id: 'send2', type: 'output.send' })
    expect(refuseConnection(doc, catalog, conn('gain', 'frame', 'send2', 'frame'))).toMatch(/already sent/)
  })

  it('refuses unknown nodes and ports', () => {
    expect(refuseConnection(customLike(), catalog, conn('nope', 'image', 'zones', 'image'))).toBe('unknown node')
    expect(refuseConnection(customLike(), catalog, conn('cap', 'nope', 'zones', 'image'))).toBe('unknown port')
  })
})

describe('effectiveValue', () => {
  const param = (name: string) => catalog.get('frame.gain')!.params.find((p) => p.name === name)!

  it('treats an omitted optional-float as unset', () => {
    expect(effectiveValue(param('cap'), undefined)).toBeNull()
  })

  it('uses the default for other omitted kinds and the value when present', () => {
    expect(effectiveValue(param('gain'), undefined)).toBe(1)
    expect(effectiveValue(param('gain'), 0.5)).toBe(0.5)
    expect(effectiveValue(param('cap'), 0.25)).toBe(0.25)
  })
})

describe('gradient stops', () => {
  it('clamps a stop between its neighbours and 0..1', () => {
    const stops = [{ pos: 0.1, color: '#000000' }, { pos: 0.5, color: '#111111' }, { pos: 0.9, color: '#222222' }]
    expect(clampStopPos(stops, 1, 0.95)).toBe(0.9)
    expect(clampStopPos(stops, 1, 0.05)).toBe(0.1)
    expect(clampStopPos(stops, 1, 0.7)).toBe(0.7)
    expect(clampStopPos(stops, 0, -1)).toBe(0)
    expect(clampStopPos(stops, 2, 5)).toBe(1)
  })

  it('inserts a stop in the widest gap with the earlier stop color', () => {
    const next = addStop([{ pos: 0, color: '#111111' }, { pos: 0.2, color: '#222222' }, { pos: 1, color: '#333333' }])
    expect(next.map((s) => s.pos)).toEqual([0, 0.2, 0.6, 1])
    expect(next[2].color).toBe('#222222')
  })
})

describe('addNode', () => {
  const gain = catalog.get('frame.gain')!

  it('gives a unique id, default params and a ui position', () => {
    const doc = builtinLike()
    const once = addNode(doc, gain, { x: 10.4, y: 20.6 })
    const twice = addNode(once, gain, { x: 0, y: 0 })
    const added = once.nodes[once.nodes.length - 1]
    expect(added.type).toBe('frame.gain')
    expect(doc.nodes.some((n) => n.id === added.id)).toBe(false)
    expect(added.params).toEqual({ gain: 1, invert: false, tint: gain.params[3].default })
    expect(once.ui![added.id]).toEqual({ x: 10, y: 21 })
    expect(new Set(twice.nodes.map((n) => n.id)).size).toBe(twice.nodes.length)
    expect(doc.nodes).toHaveLength(builtinLike().nodes.length)
  })

  it('leaves optional-float params unset and keeps the other defaults', () => {
    const real: Catalog = new Map((nodesSample.nodes as unknown as NodeTypeInfo[]).map((n) => [n.type, n]))
    const anchor = addNode(builtinLike(), real.get('palette.randomAnchor')!, { x: 0, y: 0 }).nodes.at(-1)!
    const drift = addNode(builtinLike(), real.get('audio.drift')!, { x: 0, y: 0 }).nodes.at(-1)!
    expect(anchor.params).not.toHaveProperty('seed')
    expect(drift.params).not.toHaveProperty('fixedAnchorHue')
    const info = real.get('audio.drift')!.params.find((p) => p.name === 'fixedAnchorHue')!
    expect(effectiveValue(info, drift.params?.fixedAnchorHue)).toBeNull()
    for (const p of real.get('audio.drift')!.params.filter((q) => q.kind !== 'optional-float'))
      expect(drift.params?.[p.name]).toEqual(p.default)
  })

  it('is one history entry and round-trips through the adapter', () => {
    const doc = builtinLike()
    let state = editorReducer(emptyEditor, { type: 'open', doc })
    state = editorReducer(state, { type: 'edit', change: (d) => addNode(d, gain, { x: 5, y: 6 }) })
    expect(state.past).toHaveLength(1)
    const added = state.doc!.nodes[state.doc!.nodes.length - 1]
    const flow = toFlowNodes(state.doc!, catalog).find((n) => n.id === added.id)!
    expect(flow.position).toEqual({ x: 5, y: 6 })
    expect(flow.data.params.gain).toBe(1)
    expect(toFlowEdges(state.doc!)).toHaveLength(doc.edges.length)
  })
})

describe('paletteGroups', () => {
  it('groups types by prefix', () => {
    const groups = paletteGroups(catalog)
    expect(groups.map((g) => g.prefix)).toEqual(['audio', 'frame', 'image', 'output', 'video', 'zones'])
    expect(groups.flatMap((g) => g.types)).toHaveLength(catalog.size)
  })
})
