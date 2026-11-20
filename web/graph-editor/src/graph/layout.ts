import { splitEndpoint } from './doc'
import { positionIn, type Catalog, type GraphDoc, type Position } from './types'

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

// Saved positions win. Nodes without one (built-ins, MCP drafts) get the layered layout. It runs on every
// rebuild, so it never reacts to user edits: only Tidy, paste and new content move nodes.
export function positionsFor(doc: GraphDoc, catalog: Catalog): Record<string, Position> {
  const auto = layered(doc, catalog)
  const out: Record<string, Position> = {}
  for (const node of doc.nodes) out[node.id] = positionIn(doc.ui, node.id) ?? auto[node.id]
  return out
}

// New positions for the Tidy action: `ids` (all nodes when null) laid out by `layered` from their wiring,
// keeping their current top-left, then pushed clear of the nodes left alone.
export function tidyPositions(
  doc: GraphDoc,
  catalog: Catalog,
  ids: ReadonlySet<string> | null,
  measured: Record<string, { width: number; height: number }> = {},
): Record<string, Position> {
  const now = positionsFor(doc, catalog)
  const nodes = doc.nodes.filter((n) => !ids || ids.has(n.id))
  if (nodes.length === 0) return {}
  const inside = new Set(nodes.map((n) => n.id))
  const edges = doc.edges.filter(([a, b]) => inside.has(splitEndpoint(a).node) && inside.has(splitEndpoint(b).node))
  const fresh = layered({ ...doc, nodes, edges }, catalog, measured)
  const left = Math.min(...nodes.map((n) => now[n.id].x))
  const top = Math.min(...nodes.map((n) => now[n.id].y))
  const placed: Record<string, Position> = { ...now }
  for (const n of nodes) placed[n.id] = { x: Math.round(left + fresh[n.id].x), y: Math.round(top + fresh[n.id].y) }
  const pinned = new Set(doc.nodes.filter((n) => !inside.has(n.id)).map((n) => n.id))
  const spaced = pinned.size === 0 ? placed : separate(doc, catalog, placed, pinned, measured)
  return Object.fromEntries(nodes.map((n) => [n.id, spaced[n.id]]))
}

export const NODE_WIDTH = 240

// Gaps: a node keeps this much clear space from the others.
export const NODE_GAP = 24

// Pushes unpinned nodes down (so columns stay columns) until each has NODE_GAP clear of every node placed
// before it. Pinned nodes (user placement) never move and are placed first. Sizes come from `estimateSize`
// unless a measured size is given.
export function separate(
  doc: GraphDoc,
  catalog: Catalog,
  positions: Record<string, Position>,
  pinned: ReadonlySet<string> = new Set(),
  measured: Record<string, { width: number; height: number }> = {},
  gap = NODE_GAP,
): Record<string, Position> {
  const size = (id: string) => measured[id] ?? { width: NODE_WIDTH, height: estimateHeight(doc, catalog, id) }
  const out: Record<string, Position> = { ...positions }
  const placed: string[] = doc.nodes.filter((n) => pinned.has(n.id)).map((n) => n.id)
  const loose = doc.nodes.filter((n) => !pinned.has(n.id)).map((n) => n.id)
  loose.sort((a, b) => out[a].x - out[b].x || out[a].y - out[b].y)
  for (const id of loose) {
    const { width, height } = size(id)
    // Each pass lands below one blocker, so it ends within `placed.length` moves.
    for (let pass = 0; pass <= placed.length; pass++) {
      const blocker = placed.find((other) => {
        const o = out[other]
        const s = size(other)
        return (
          out[id].x < o.x + s.width + gap && o.x < out[id].x + width + gap && out[id].y < o.y + s.height + gap && o.y < out[id].y + height + gap
        )
      })
      if (!blocker) break
      out[id] = { x: out[id].x, y: Math.round(out[blocker].y + size(blocker).height + gap) }
    }
    placed.push(id)
  }
  return out
}

export const COLUMN_GAP = 64

// A tidy left-to-right layout from the wiring alone, using measured sizes when given. Columns are the
// longest path from the left, except that a node with no inputs sits just before its first consumer. A
// column is as wide as its widest node. Rows keep document order but sit level with the nodes that feed
// them, pushed down only as far as the gap needs, so a branch does not drop below its neighbours.
export function layered(
  doc: GraphDoc,
  catalog: Catalog,
  measured: Record<string, { width: number; height: number }> = {},
  gap = NODE_GAP,
): Record<string, Position> {
  return layeredFull(doc, catalog, measured, { gap }).positions
}

export type LayeredOptions = {
  gap?: number
  columnGap?: number
  // How far below a node's top its wires leave and enter (the port row, or half the height).
  portOffset?: number
}

// Same layout, plus the lane points of each wire that skips columns, keyed `from>to` in column order, as
// the centre of the lane in its column (x) and the row its wire runs along (y).
export function layeredFull(
  doc: GraphDoc,
  catalog: Catalog,
  measured: Record<string, { width: number; height: number }> = {},
  options: LayeredOptions = {},
): { positions: Record<string, Position>; lanes: Record<string, Position[]> } {
  const gap = options.gap ?? NODE_GAP
  const columnGap = options.columnGap ?? COLUMN_GAP
  const PORT_OFFSET = options.portOffset ?? 48
  const ids = doc.nodes.map((n) => n.id)
  const known = new Set(ids)
  const feeds = new Map<string, string[]>(ids.map((id) => [id, []]))
  const eats = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const [from, to] of doc.edges) {
    const s = splitEndpoint(from).node
    const t = splitEndpoint(to).node
    if (known.has(s) && known.has(t) && s !== t) {
      feeds.get(t)!.push(s)
      eats.get(s)!.push(t)
    }
  }
  const size = (id: string) => measured[id] ?? { width: NODE_WIDTH, height: estimateHeight(doc, catalog, id) }

  const depth = new Map<string, number>()
  const visiting = new Set<string>()
  const depthOf = (id: string): number => {
    const cached = depth.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 0
    visiting.add(id)
    let d = 0
    for (const s of feeds.get(id)!) d = Math.max(d, depthOf(s) + 1)
    visiting.delete(id)
    depth.set(id, d)
    return d
  }
  for (const id of ids) depthOf(id)
  for (const id of ids) {
    if (feeds.get(id)!.length === 0 && eats.get(id)!.length > 0) {
      depth.set(id, Math.min(...eats.get(id)!.map((t) => depth.get(t)!)) - 1)
    }
  }

  // A wire that skips columns gets a thin dummy node in each column it crosses, so real nodes stack
  // around its lane instead of sitting on top of it. The target is then fed by the last dummy.
  const LANE = 16
  const column = new Map<string, number>(ids.map((id) => [id, depth.get(id)!]))
  const lanes: string[] = []
  const inputs = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const id of ids) {
    for (const s of feeds.get(id)!) {
      let prev = s
      for (let c = column.get(s)! + 1; c < column.get(id)!; c++) {
        const lane = `~${s}>${id}:${c}`
        column.set(lane, c)
        inputs.set(lane, [prev])
        lanes.push(lane)
        prev = lane
      }
      inputs.get(id)!.push(prev)
    }
  }
  const all = [...ids, ...lanes]
  const isLane = (id: string) => id.startsWith('~')
  const heightOf = (id: string) => (isLane(id) ? LANE : size(id).height)
  const widthOf = (id: string) => (isLane(id) ? 0 : size(id).width)

  const columns = [...new Set(all.map((id) => column.get(id)!))].sort((a, b) => a - b)
  const left = new Map<number, number>()
  let x = 0
  for (const c of columns) {
    left.set(c, x)
    x += Math.max(...all.filter((id) => column.get(id) === c).map(widthOf)) + columnGap
  }

  const placed: Record<string, Position> = {}
  // Where the wire from `from` leaves, as a node top: a lane sits at the port row, a node at its top.
  const topOf = (from: string) => placed[from].y - (isLane(from) ? PORT_OFFSET : 0)
  for (const c of columns) {
    const members = all
      .filter((id) => column.get(id) === c)
      .map((id, order) => {
        const above = inputs.get(id)!
        // Fed by a lane: sit level with the lowest lane, so the long wire stays flat past the nodes between.
        const lanesIn = above.filter(isLane)
        const level = lanesIn.length
          ? Math.max(...lanesIn.map(topOf))
          : above.length
            ? above.reduce((sum, f) => sum + topOf(f), 0) / above.length
            : 0
        return { id, order, level: isLane(id) ? level + PORT_OFFSET : level }
      })
      .sort((a, b) => a.level - b.level || a.order - b.order)
    // Lanes keep their level (the wire runs straight along it); real nodes stack around them.
    const laneRows: { y: number; h: number }[] = []
    let laneBottom = -Infinity
    for (const m of members.filter((m) => isLane(m.id))) {
      const y = Math.max(m.level, laneBottom + gap)
      placed[m.id] = { x: left.get(c)!, y: Math.round(y) }
      laneRows.push({ y, h: LANE })
      laneBottom = y + LANE
    }
    let bottom = -Infinity
    for (const m of members.filter((m) => !isLane(m.id))) {
      const h = heightOf(m.id)
      let y = Math.max(m.level, bottom + gap)
      for (let moved = true; moved; ) {
        moved = false
        for (const lane of laneRows) {
          if (y < lane.y + lane.h + gap && lane.y < y + h + gap) {
            y = lane.y + lane.h + gap
            moved = true
          }
        }
      }
      placed[m.id] = { x: left.get(c)!, y: Math.round(y) }
      bottom = y + h
    }
  }
  const top = Math.min(...ids.map((id) => placed[id].y))
  const out: Record<string, Position> = {}
  for (const id of ids) out[id] = { x: Math.round(placed[id].x), y: placed[id].y - top }
  const laneOut: Record<string, Position[]> = {}
  for (const id of lanes) {
    const [pair] = id.slice(1).split(':')
    const c = column.get(id)!
    const width = Math.max(...all.filter((o) => column.get(o) === c).map(widthOf))
    ;(laneOut[pair] ??= []).push({ x: placed[id].x + width / 2, y: placed[id].y - top })
  }
  return { positions: out, lanes: laneOut }
}
