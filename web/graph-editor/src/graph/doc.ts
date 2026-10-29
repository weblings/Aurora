import { dropControlsOf } from './controls'
import type { GraphDoc, GraphEdge, ParamValue, Position } from './types'

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
