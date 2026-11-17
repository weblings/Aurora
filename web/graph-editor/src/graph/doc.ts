import { controlsOf, dropControlsOf, type Control } from './controls'
import type { Catalog, GraphDoc, GraphEdge, GraphNode, NodeTypeInfo, ParamInfo, ParamValue, Position } from './types'
import { positionIn } from './types'
import { SECTIONS_KEY } from '../../../ui/TuningControls.js'

// Every edit returns a new document and leaves the old one untouched, so the
// whole graph stays one JSON value that undo and autosave can snapshot.

export function splitEndpoint(endpoint: string): { node: string; port: string } {
  const dot = endpoint.lastIndexOf('.')
  return { node: endpoint.slice(0, dot), port: endpoint.slice(dot + 1) }
}

export function joinEndpoint(node: string, port: string): string {
  return `${node}.${port}`
}

export function setParam(doc: GraphDoc, nodeId: string, name: string, value: ParamValue): GraphDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((node) =>
      node.id === nodeId ? { ...node, params: { ...node.params, [name]: value } } : node,
    ),
  }
}

export function moveNodes(doc: GraphDoc, positions: Record<string, Position>): GraphDoc {
  return { ...doc, ui: { ...doc.ui, ...positions } }
}

export function addEdge(doc: GraphDoc, edge: GraphEdge): GraphDoc {
  return { ...doc, edges: [...doc.edges, edge] }
}

export function removeEdge(doc: GraphDoc, edge: GraphEdge): GraphDoc {
  return { ...doc, edges: doc.edges.filter((e) => e[0] !== edge[0] || e[1] !== edge[1]) }
}

// Removes nodes with their edges, layout entries and Dashboard controls.
export function removeNodes(doc: GraphDoc, ids: ReadonlySet<string>): GraphDoc {
  const next: GraphDoc = {
    ...doc,
    nodes: doc.nodes.filter((node) => !ids.has(node.id)),
    edges: doc.edges.filter(
      ([from, to]) => !ids.has(splitEndpoint(from).node) && !ids.has(splitEndpoint(to).node),
    ),
  }
  if (doc.ui) {
    next.ui = Object.fromEntries(Object.entries(doc.ui).filter(([id]) => id === SECTIONS_KEY || !ids.has(id)))
  }
  return dropControlsOf(next, ids)
}

// An id no node uses: the type's last segment, then -2, -3, ...
export function freshNodeId(doc: GraphDoc, type: string): string {
  const used = new Set(doc.nodes.map((n) => n.id))
  const base = type.slice(type.lastIndexOf('.') + 1) || 'node'
  if (!used.has(base)) return base
  for (let n = 2; ; n++) {
    if (!used.has(`${base}-${n}`)) return `${base}-${n}`
  }
}

// An enum whose default is not one of its options (the output binding defaults
// to "") would badge the new node; start it on the first option instead.
function defaultFor(p: ParamInfo): ParamValue {
  if (p.kind === 'enum' && p.options?.length && !p.options.includes(String(p.default))) return p.options[0]
  return p.default
}

// Appends a node of `info`'s type with every param at its default, placed at
// `at` (saved in `ui`, so it stays where it was dropped).
export function addNode(doc: GraphDoc, info: NodeTypeInfo, at: Position): GraphDoc {
  const id = freshNodeId(doc, info.type)
  // An optional-float's catalog default is a display placeholder; omitted means unset.
  const params = Object.fromEntries(
    info.params.filter((p) => p.kind !== 'optional-float').map((p) => [p.name, defaultFor(p)]),
  )
  return {
    ...doc,
    nodes: [...doc.nodes, { id, type: info.type, params }],
    ui: { ...doc.ui, [id]: { x: Math.round(at.x), y: Math.round(at.y) } },
  }
}

// Clipboard (Aurora-ge1i.2.1). A clip is the selected nodes, the wires between
// them, their layout and their Dashboard controls, marked so a paste can tell it
// from other text on the system clipboard (and so it works across tabs).
export const CLIP_MARK = 'aurora-graph-clip'

export type Clip = {
  [CLIP_MARK]: 1
  nodes: GraphNode[]
  edges: GraphEdge[]
  ui: Record<string, Position>
  controls: Control[]
}

const copyJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

// `positions` fills in nodes the document has no saved layout for.
export function copySelection(doc: GraphDoc, ids: ReadonlySet<string>, positions: Record<string, Position> = {}): Clip {
  const nodes = doc.nodes.filter((n) => ids.has(n.id))
  const kept = new Set(nodes.map((n) => n.id))
  const ui: Record<string, Position> = {}
  for (const id of kept) {
    const at = positionIn(doc.ui, id) ?? positions[id]
    if (at) ui[id] = { x: at.x, y: at.y }
  }
  return copyJson({
    [CLIP_MARK]: 1,
    nodes,
    edges: doc.edges.filter(([a, b]) => kept.has(splitEndpoint(a).node) && kept.has(splitEndpoint(b).node)),
    ui,
    controls: controlsOf(doc).filter((c) => kept.has(c.node)),
  })
}

// The clip in `text`, or null for anything else (plain text, other JSON, a damaged clip).
export function parseClip(text: string): Clip | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const clip = raw as Partial<Clip> | null
  if (!clip || typeof clip !== 'object' || clip[CLIP_MARK] !== 1 || !Array.isArray(clip.nodes)) return null
  const nodes = clip.nodes.filter((n): n is GraphNode => !!n && typeof n.id === 'string' && typeof n.type === 'string')
  const edges = (Array.isArray(clip.edges) ? clip.edges : []).filter(
    (e): e is GraphEdge => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string',
  )
  // Only {x, y} entries are positions: '#sections' and junk never reach a paste.
  const ui = Object.fromEntries(
    Object.entries(clip.ui && typeof clip.ui === 'object' ? clip.ui : {}).filter(
      ([, p]) => !!p && !Array.isArray(p) && typeof p.x === 'number' && typeof p.y === 'number',
    ),
  )
  const controls = (Array.isArray(clip.controls) ? clip.controls : []).filter(
    (c): c is Control => !!c && typeof c.node === 'string' && typeof c.param === 'string',
  )
  return { [CLIP_MARK]: 1, nodes, edges, ui, controls }
}

// A type the graph may hold once: the output node (the catalog's `sink` types).
export const isSingleton = (info: NodeTypeInfo): boolean => !!info.sink

export type Skipped = { id: string; type: string; reason: 'unknown' | 'single' }

// Adds the clip with fresh ids, its top-left corner at `at`. Unknown types and a
// singleton the graph already has are left out with their wires; Dashboard controls
// come along. `added` maps each clip id to its new id.
export function pasteSelection(
  doc: GraphDoc,
  clip: Clip,
  at: Position,
  catalog: Catalog,
): { doc: GraphDoc; added: Map<string, string>; skipped: Skipped[] } {
  const skipped: Skipped[] = []
  const added = new Map<string, string>()
  const have = new Set(doc.nodes.map((n) => n.type))
  const pasted: GraphNode[] = []
  let next = doc
  for (const node of clip.nodes) {
    const info = catalog.get(node.type)
    if (!info) skipped.push({ id: node.id, type: node.type, reason: 'unknown' })
    else if (isSingleton(info) && have.has(node.type)) skipped.push({ id: node.id, type: node.type, reason: 'single' })
    else {
      have.add(node.type)
      const id = freshNodeId(next, node.type)
      added.set(node.id, id)
      const copy = { ...copyJson(node), id }
      pasted.push(copy)
      next = { ...next, nodes: [...next.nodes, copy] }
    }
  }
  if (pasted.length === 0) return { doc, added, skipped }

  const origin = [...added.keys()].map((id) => clip.ui[id]).filter((p): p is Position => !!p)
  const minX = Math.min(...origin.map((p) => p.x))
  const minY = Math.min(...origin.map((p) => p.y))
  const ui = { ...doc.ui }
  for (const [from, to] of added) {
    const p = clip.ui[from]
    if (p) ui[to] = { x: Math.round(at.x + p.x - minX), y: Math.round(at.y + p.y - minY) }
    else ui[to] = { x: Math.round(at.x), y: Math.round(at.y) }
  }
  const remap = (endpoint: string): string | null => {
    const { node, port } = splitEndpoint(endpoint)
    const id = added.get(node)
    return id === undefined ? null : joinEndpoint(id, port)
  }
  const edges: GraphEdge[] = []
  for (const [a, b] of clip.edges) {
    const from = remap(a)
    const to = remap(b)
    if (from && to) edges.push([from, to])
  }
  const controls = clip.controls.filter((c) => added.has(c.node)).map((c) => ({ ...copyJson(c), node: added.get(c.node)! }))
  const out: GraphDoc = { ...next, edges: [...next.edges, ...edges], ui }
  return { doc: controls.length > 0 ? { ...out, controls: [...controlsOf(out), ...controls] } : out, added, skipped }
}

const plural = (n: number) => `${n} ${n === 1 ? 'node' : 'nodes'}`

// The paste's outcome in words, or null when everything landed (announced, not drawn).
export function pasteNote(pasted: number, skipped: readonly Skipped[], catalog: Catalog): string | null {
  if (skipped.length === 0) return null
  const single = [...new Set(skipped.filter((s) => s.reason === 'single').map((s) => s.type))]
  const unknown = skipped.some((s) => s.reason === 'unknown')
  let why: string
  if (unknown && single.length === 0) why = 'unknown type here'
  else if (single.length === 1 && !unknown) why = `${catalog.get(single[0])?.title ?? single[0]} allows only one`
  else why = 'only one of each allowed'
  return pasted === 0 ? `Nothing pasted: ${why}` : `Pasted ${plural(pasted)}, skipped ${skipped.length} (${why})`
}
