import { splitEndpoint } from '../graph/doc'
import { layeredFull, positionsFor } from '../graph/layout'
import { nodeTitle } from '../graph/nodeTitle'
import { portStyle } from '../graph/portStyle'
import type { Catalog, GraphDoc, ParamValue } from '../graph/types'

// The abstract view of a recipe, made from the same clip JSON as the viewer: a text list (also the viewer's
// text alternative) and a box-and-wire layout for the SVG. Real node names, so an audio.features node with an
// rms output is shown as that, not as audio.features.rms.
export type Step = {
  id: string
  type: string
  title: string
  // "buffer from mic.buffer (audio.capture)" per wired input.
  takes: string[]
  // Params the clip sets, minus the output binding.
  set: string[]
}

const show = (v: ParamValue): string => (typeof v === 'string' ? v : Array.isArray(v) ? `${v.length} stops` : String(v))

// Upstream first; ties keep document order.
export function outlineSteps(doc: GraphDoc, catalog: Catalog): Step[] {
  const ids = doc.nodes.map((n) => n.id)
  const feeds = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const [a, b] of doc.edges) feeds.get(splitEndpoint(b).node)?.push(splitEndpoint(a).node)
  const order: string[] = []
  const done = new Set<string>()
  while (order.length < ids.length) {
    const next = ids.find((id) => !done.has(id) && feeds.get(id)!.every((f) => done.has(f)))
    if (next === undefined) {
      for (const id of ids) if (!done.has(id)) order.push(id), done.add(id)
      break
    }
    order.push(next)
    done.add(next)
  }
  const byId = new Map(doc.nodes.map((n) => [n.id, n]))
  return order.map((id) => {
    const node = byId.get(id)!
    const info = catalog.get(node.type)
    const takes = doc.edges
      .filter(([, to]) => splitEndpoint(to).node === id)
      .map(([from, to]) => {
        const src = splitEndpoint(from)
        const srcNode = byId.get(src.node)
        return `${splitEndpoint(to).port} from ${src.node}.${src.port} (${srcNode?.type ?? 'unknown'})`
      })
    const set = Object.entries(node.params ?? {})
      .filter(([name, v]) => name !== 'output' && v !== null)
      .map(([name, v]) => `${name} ${show(v)}`)
    return { id, type: node.type, title: nodeTitle(info, node.type), takes, set }
  })
}

export const BOX_W = 176
export const BOX_H = 48
const COL_GAP = 48
const ROW_GAP = 16

export type DiagramBox = { id: string; title: string; type: string; x: number; y: number }
export type DiagramWire = { id: string; d: string; color: string; bulk: boolean; dashed: boolean }
export type Diagram = { width: number; height: number; boxes: DiagramBox[]; wires: DiagramWire[] }

// Columns are the saved x positions in order, rows the saved y order within a column.
export function diagram(doc: GraphDoc, catalog: Catalog): Diagram {
  const at = positionsFor(doc, catalog)
  const xs = [...new Set(doc.nodes.map((n) => Math.round(at[n.id].x)))].sort((a, b) => a - b)
  const rows = new Map<number, number>()
  const boxes: DiagramBox[] = []
  const byColumn = new Map<number, string[]>()
  for (const n of [...doc.nodes].sort((a, b) => at[a.id].y - at[b.id].y)) {
    const col = xs.indexOf(Math.round(at[n.id].x))
    const row = rows.get(col) ?? 0
    rows.set(col, row + 1)
    byColumn.set(col, [...(byColumn.get(col) ?? []), n.id])
    boxes.push({
      id: n.id,
      title: nodeTitle(catalog.get(n.type), n.type),
      type: n.type,
      x: col * (BOX_W + COL_GAP),
      y: row * (BOX_H + ROW_GAP),
    })
  }
  const box = new Map(boxes.map((b) => [b.id, b]))
  const wires: DiagramWire[] = doc.edges.flatMap(([a, b]) => {
    const from = splitEndpoint(a)
    const to = splitEndpoint(b)
    const s = box.get(from.node)
    const t = box.get(to.node)
    if (!s || !t) return []
    const type = catalog.get(doc.nodes.find((n) => n.id === from.node)?.type ?? '')?.outputs.find((p) => p.name === from.port)?.type ?? ''
    const look = portStyle(type)
    const x1 = s.x + BOX_W
    const y1 = s.y + BOX_H / 2
    const x2 = t.x
    const y2 = t.y + BOX_H / 2
    const bend = Math.max(24, (x2 - x1) / 2)
    return [{ id: `${a}->${b}`, d: `M${x1} ${y1} C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`, color: look.color, bulk: look.bulk, dashed: look.dashed }]
  })
  const width = Math.max(...boxes.map((b) => b.x + BOX_W))
  const height = Math.max(...boxes.map((b) => b.y + BOX_H))
  return { width, height, boxes, wires }
}

// Narrow screens: the same layered layout turned 90 degrees, so the flow runs down the page. Boxes are small
// and show the title only (the full text outline stays in the page for assistive tech). Parallel branches sit
// side by side, so the widest layer decides the box width and nothing needs a sideways scroll.
export const TURN_W = 76
export const TURN_H = 40
export const TURN_VIEW = 340

export type TurnedBox = { id: string; lines: string[]; x: number; y: number }
export type TurnedDiagram = { width: number; height: number; boxes: TurnedBox[]; wires: DiagramWire[] }

// A title on one line, or two split at the space nearest the middle.
export function titleLines(title: string): string[] {
  if (title.length <= 11 || !title.includes(' ')) return [title]
  const mid = title.length / 2
  const at = [...title].map((c, i) => (c === ' ' ? i : -1)).filter((i) => i >= 0).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0]
  return [title.slice(0, at), title.slice(at + 1)]
}

export function turnedDiagram(doc: GraphDoc, catalog: Catalog): TurnedDiagram {
  const uniform = Object.fromEntries(doc.nodes.map((n) => [n.id, { width: TURN_H, height: TURN_W }]))
  const { positions, lanes } = layeredFull(doc, catalog, uniform, { gap: 8, columnGap: 26, portOffset: TURN_W / 2 })
  // layered runs left to right: its x is our downward flow, its y our sideways position.
  const xs = Object.values(positions).map((p) => p.y).concat(Object.values(lanes).flat().map((p) => p.y))
  const used = Math.max(...xs) + TURN_W
  const width = Math.max(TURN_VIEW, used)
  const shift = (width - used) / 2
  const at = (id: string) => ({ x: positions[id].y + shift, y: positions[id].x })
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]))
  const boxes: TurnedBox[] = doc.nodes.map((n) => ({
    id: n.id,
    lines: titleLines(nodeTitle(catalog.get(n.type), n.type)),
    ...at(n.id),
  }))
  const wires: DiagramWire[] = doc.edges.flatMap(([a, b]) => {
    const from = splitEndpoint(a)
    const to = splitEndpoint(b)
    if (!positions[from.node] || !positions[to.node]) return []
    const s = at(from.node)
    const t = at(to.node)
    const via = (lanes[`${from.node}>${to.node}`] ?? []).map((p) => ({ x: p.y + shift, y: p.x }))
    const points = [{ x: s.x + TURN_W / 2, y: s.y + TURN_H }, ...via, { x: t.x + TURN_W / 2, y: t.y }]
    // Down-flowing curve through each point: vertical tangents, so wires leave and enter the boxes square.
    let d = `M${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1]
      const q = points[i]
      const mid = (p.y + q.y) / 2
      d += ` C${p.x} ${mid} ${q.x} ${mid} ${q.x} ${q.y}`
    }
    const type = catalog.get(nodes.get(from.node)?.type ?? '')?.outputs.find((p) => p.name === from.port)?.type ?? ''
    const look = portStyle(type)
    return [{ id: `${a}->${b}`, d, color: look.color, bulk: look.bulk, dashed: look.dashed }]
  })
  const height = Math.max(...boxes.map((b) => b.y)) + TURN_H
  return { width, height, boxes, wires }
}
