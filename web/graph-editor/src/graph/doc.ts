import { dropControlsOf } from './controls'
import type { GraphDoc, GraphEdge, NodeTypeInfo, ParamInfo, ParamValue, Position } from './types'

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
    next.ui = Object.fromEntries(Object.entries(doc.ui).filter(([id]) => !ids.has(id)))
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
