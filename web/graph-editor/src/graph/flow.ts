import type { Edge, Node } from '@xyflow/react'
import { splitEndpoint } from './doc'
import { positionsFor } from './layout'
import type { Catalog, GraphDoc, GraphEdge, NodeTypeInfo, ParamValue } from './types'

export type AuroraNodeData = {
  type: string
  // Undefined when the catalog has no such type (a graph from a newer build).
  info: NodeTypeInfo | undefined
  params: Record<string, ParamValue>
  // Input ports with an edge, so the node can dim the ones still open.
  connectedInputs: ReadonlySet<string>
  [key: string]: unknown
}

export const NODE_KIND = 'aurora'

export function edgeId(edge: GraphEdge): string {
  return `${edge[0]}->${edge[1]}`
}

export function toFlowNodes(doc: GraphDoc, catalog: Catalog): Node<AuroraNodeData>[] {
  const positions = positionsFor(doc, catalog)
  const fed = new Map<string, Set<string>>()
  for (const [, to] of doc.edges) {
    const { node, port } = splitEndpoint(to)
    if (!fed.has(node)) fed.set(node, new Set())
    fed.get(node)!.add(port)
  }
  return doc.nodes.map((node) => ({
    id: node.id,
    type: NODE_KIND,
    position: positions[node.id],
    data: {
      type: node.type,
      info: catalog.get(node.type),
      params: node.params ?? {},
      connectedInputs: fed.get(node.id) ?? new Set(),
    },
  }))
}

export function toFlowEdges(doc: GraphDoc): Edge[] {
  return doc.edges.map((edge) => {
    const from = splitEndpoint(edge[0])
    const to = splitEndpoint(edge[1])
    return {
      id: edgeId(edge),
      source: from.node,
      sourceHandle: from.port,
      target: to.node,
      targetHandle: to.port,
    }
  })
}

// React Flow owns selection and measured size; the document owns the rest.
// When the document changes, carry those two over by id.
export function carryViewState<T extends { id: string; selected?: boolean; measured?: unknown }>(
  previous: readonly T[],
  next: T[],
): T[] {
  const byId = new Map(previous.map((item) => [item.id, item]))
  return next.map((item) => {
    const old = byId.get(item.id)
    return old ? { ...item, selected: old.selected, measured: old.measured } : item
  })
}
