import { splitEndpoint } from './doc'
import type { Catalog, GraphDoc, Position } from './types'

export const COLUMN_WIDTH = 300
const ROW_GAP = 24
const PORT_ROW = 22
const PARAM_ROW = 44
const HEADER = 40

// Rough rendered height; the layout runs before React Flow measures anything.
export function estimateHeight(doc: GraphDoc, catalog: Catalog, id: string): number {
  const node = doc.nodes.find((n) => n.id === id)
  const info = node && catalog.get(node.type)
  if (!info) return HEADER + PORT_ROW
  const ports = Math.max(info.inputs.length, info.outputs.length)
  return HEADER + ports * PORT_ROW + info.params.length * PARAM_ROW
}

// Columns by topological depth (longest path from a node with no inputs), rows
// stacked in document order. Nodes in a cycle (invalid anyway) fall back to
// column 0 rather than looping.
export function columnLayout(doc: GraphDoc, catalog: Catalog): Record<string, Position> {
  const ids = doc.nodes.map((n) => n.id)
  const known = new Set(ids)
  const upstream = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const [from, to] of doc.edges) {
    const source = splitEndpoint(from).node
    const target = splitEndpoint(to).node
    if (known.has(source) && known.has(target)) upstream.get(target)!.push(source)
  }

  const depth = new Map<string, number>()
  const visiting = new Set<string>()
  const depthOf = (id: string): number => {
    const cached = depth.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 0
    visiting.add(id)
    let d = 0
    for (const source of upstream.get(id)!) d = Math.max(d, depthOf(source) + 1)
    visiting.delete(id)
    depth.set(id, d)
    return d
  }

  const columnBottom = new Map<number, number>()
  const out: Record<string, Position> = {}
  for (const id of ids) {
    const column = depthOf(id)
    const y = columnBottom.get(column) ?? 0
    out[id] = { x: column * COLUMN_WIDTH, y }
    columnBottom.set(column, y + estimateHeight(doc, catalog, id) + ROW_GAP)
  }
  return out
}

// Saved positions win; nodes without one (built-ins have no ui) get the column
// layout.
export function positionsFor(doc: GraphDoc, catalog: Catalog): Record<string, Position> {
  const auto = columnLayout(doc, catalog)
  const out: Record<string, Position> = {}
  for (const node of doc.nodes) out[node.id] = doc.ui?.[node.id] ?? auto[node.id]
  return out
}
