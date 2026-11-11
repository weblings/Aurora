import { addEdge, addNode, joinEndpoint, splitEndpoint } from './doc'
import { COLUMN_WIDTH, estimateHeight, positionsFor } from './layout'
import type { Catalog, GraphDoc, ParamValue, Position } from './types'

export type Connection = {
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

// The loader's wiring rules (GraphLoader.cpp), so a refused drag matches what
// validation would reject: exact port-type match, one edge per input, no
// cycles, one output.send per output. Returns the reason, or null if allowed.
export function refuseConnection(doc: GraphDoc, catalog: Catalog, c: Connection): string | null {
  const source = doc.nodes.find((n) => n.id === c.source)
  const target = doc.nodes.find((n) => n.id === c.target)
  if (!source || !target) return 'unknown node'
  const out = catalog.get(source.type)?.outputs.find((p) => p.name === c.sourceHandle)
  const targetInfo = catalog.get(target.type)
  const input = targetInfo?.inputs.find((p) => p.name === c.targetHandle)
  if (!out || !input) return 'unknown port'

  if (out.type !== input.type) {
    const reason = `${out.type} output cannot feed a ${input.type} input`
    if (out.type === 'Float' && input.type === 'Angle') return `${reason}; convert it with an angle.fromFloat node`
    if (out.type === 'Angle' && input.type === 'Float') return `${reason}; convert it with an angle.toFloat node`
    return reason
  }

  const taken = `${c.target}.${c.targetHandle}`
  if (doc.edges.some(([, to]) => to === taken)) return 'this input already has a connection'

  if (c.source === c.target || reaches(doc, c.target, c.source)) return 'this connection would form a cycle'

  if (targetInfo?.sink) {
    const output = outputBinding(doc, catalog, target.id)
    if (output) {
      const other = doc.nodes.find(
        (n) =>
          n.id !== target.id &&
          catalog.get(n.type)?.sink &&
          outputBinding(doc, catalog, n.id) === output &&
          doc.edges.some(([, to]) => splitEndpoint(to).node === n.id),
      )
      if (other) return `output '${output}' is already sent by '${other.id}'`
    }
  }
  return null
}

function outputBinding(doc: GraphDoc, catalog: Catalog, nodeId: string): string | null {
  const node = doc.nodes.find((n) => n.id === nodeId)
  const sink = node && catalog.get(node.type)?.sink
  if (!node || !sink) return null
  const value: ParamValue | undefined =
    node.params?.[sink] ?? catalog.get(node.type)?.params.find((p) => p.name === sink)?.default
  return typeof value === 'string' && value !== '' ? value : null
}

// True if `to` is reachable from `from` along edges.
function reaches(doc: GraphDoc, from: string, to: string): boolean {
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (id === to) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const [a, b] of doc.edges) {
      if (splitEndpoint(a).node === id) stack.push(splitEndpoint(b).node)
    }
  }
  return false
}

// Float <-> Angle is the one mismatch with a converter node. Returns its type.
export function converterFor(doc: GraphDoc, catalog: Catalog, c: Connection): string | null {
  const out = catalog.get(doc.nodes.find((n) => n.id === c.source)?.type ?? '')?.outputs.find((p) => p.name === c.sourceHandle)
  const input = catalog.get(doc.nodes.find((n) => n.id === c.target)?.type ?? '')?.inputs.find((p) => p.name === c.targetHandle)
  if (out?.type === 'Float' && input?.type === 'Angle') return 'angle.fromFloat'
  if (out?.type === 'Angle' && input?.type === 'Float') return 'angle.toFloat'
  return null
}

// Drops a Float/Angle wire as source -> converter -> target: an ordinary node
// and two ordinary edges, so the saved graph needs no new format. Returns the
// new document, or the reason the second hop is refused (input taken, cycle,
// output already sent) or why there is no converter. The converter sits between
// the two nodes, moved down until it overlaps neither them nor any other node.
export function insertConverter(
  doc: GraphDoc,
  catalog: Catalog,
  c: Connection,
): { doc: GraphDoc; id: string } | { reason: string } {
  const type = converterFor(doc, catalog, c)
  const info = type ? catalog.get(type) : undefined
  if (!type || !info) return { reason: refuseConnection(doc, catalog, c) ?? 'no converter for these ports' }
  const inPort = info.inputs[0]?.name
  const outPort = info.outputs[0]?.name
  if (!inPort || !outPort) return { reason: 'unknown port' }

  const pos = positionsFor(doc, catalog)
  const from = pos[c.source]
  const to = pos[c.target]
  const at = freeSpot(doc, catalog, pos, { x: Math.round((from.x + to.x) / 2), y: Math.round((from.y + to.y) / 2) }, estimateHeight2(info.inputs.length, info.outputs.length, info.params.length))

  const withNode = addNode(doc, info, at)
  const id = withNode.nodes[withNode.nodes.length - 1].id
  const reason = refuseConnection(withNode, catalog, { source: id, sourceHandle: outPort, target: c.target, targetHandle: c.targetHandle })
  if (reason) return { reason }
  const next = addEdge(
    addEdge(withNode, [joinEndpoint(c.source, c.sourceHandle), joinEndpoint(id, inPort)]),
    [joinEndpoint(id, outPort), joinEndpoint(c.target, c.targetHandle)],
  )
  return { doc: next, id }
}

const NODE_WIDTH = COLUMN_WIDTH - 20
const GAP = 24

function estimateHeight2(inputs: number, outputs: number, params: number): number {
  return 40 + Math.max(inputs, outputs) * 22 + params * 44
}

function freeSpot(doc: GraphDoc, catalog: Catalog, pos: Record<string, Position>, start: Position, height: number): Position {
  const rects = doc.nodes.map((n) => ({ ...pos[n.id], h: estimateHeight(doc, catalog, n.id) }))
  const hits = (y: number) =>
    rects.find(
      (r) => start.x < r.x + NODE_WIDTH + GAP && r.x < start.x + NODE_WIDTH + GAP && y < r.y + r.h + GAP && r.y < y + height + GAP,
    )
  let y = start.y
  for (let guard = 0; guard < 200; guard++) {
    const hit = hits(y)
    if (!hit) break
    y = hit.y + hit.h + GAP
  }
  return { x: start.x, y }
}
