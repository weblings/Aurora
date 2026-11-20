import { splitEndpoint } from '../graph/doc'
import { positionsFor } from '../graph/layout'
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
