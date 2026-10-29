import { describe, expect, it } from 'vitest'
import { refuseConnection, type Connection } from './connection'
import { addEdge, moveNodes, removeEdge, removeNodes, setParam, splitEndpoint } from './doc'
import { carryViewState, toFlowEdges, toFlowNodes } from './flow'
import { columnLayout, positionsFor } from './layout'
import { addStop } from '../ParamWidget'
import { builtinLike, catalog, customLike } from './fixtures'

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

describe('gradient stops', () => {
  it('inserts a stop in the widest gap with the earlier stop color', () => {
    const next = addStop([{ pos: 0, color: '#111111' }, { pos: 0.2, color: '#222222' }, { pos: 1, color: '#333333' }])
    expect(next.map((s) => s.pos)).toEqual([0, 0.2, 0.6, 1])
    expect(next[2].color).toBe('#222222')
  })
})
