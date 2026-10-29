// What the server says is wrong with a draft, regrouped by the node, port or
// param to badge. Two sources: validation (`errors` of PUT /api/graph/drafts,
// each naming a node and sometimes a port or param) and the preview's runtime
// `errors` (output, node, message).

export type ServerIssue = {
  node: string | null
  message: string
  code?: string
  port?: string | null
  param?: string | null
  options?: string[]
}

export type PreviewIssue = { output: string; node: string; message: string }

export type NodeProblems = {
  // Whole-node problems, plus the ones that named a port or param (so the
  // header badge counts everything).
  messages: string[]
  ports: ReadonlyMap<string, string[]>
  params: ReadonlyMap<string, string[]>
}

export type Problems = {
  nodes: ReadonlyMap<string, NodeProblems>
  // Issues with no node, or naming one that is not in the document.
  graph: string[]
}

export const noProblems: Problems = { nodes: new Map(), graph: [] }

function push<K>(map: Map<K, string[]>, key: K, message: string) {
  const list = map.get(key)
  if (list) {
    if (!list.includes(message)) list.push(message)
  } else {
    map.set(key, [message])
  }
}

// `nodeIds` are the document's nodes: an issue naming any other id (a node
// since deleted, a stale preview) cannot be badged and goes to the graph list.
export function groupProblems(
  issues: readonly ServerIssue[],
  runtime: readonly PreviewIssue[],
  nodeIds: ReadonlySet<string>,
): Problems {
  const messages = new Map<string, string[]>()
  const ports = new Map<string, Map<string, string[]>>()
  const params = new Map<string, Map<string, string[]>>()
  const graph: string[] = []

  const add = (node: string | null | undefined, message: string, port?: string | null, param?: string | null) => {
    if (!node || !nodeIds.has(node)) {
      if (!graph.includes(message)) graph.push(message)
      return
    }
    push(messages, node, message)
    if (port) push(ports.get(node) ?? ports.set(node, new Map()).get(node)!, port, message)
    if (param) push(params.get(node) ?? params.set(node, new Map()).get(node)!, param, message)
  }

  for (const issue of issues) add(issue.node, issue.message, issue.port, issue.param)
  for (const issue of runtime) add(issue.node, issue.message)

  const nodes = new Map<string, NodeProblems>()
  for (const [id, list] of messages) {
    nodes.set(id, { messages: list, ports: ports.get(id) ?? new Map(), params: params.get(id) ?? new Map() })
  }
  return { nodes, graph }
}

// Keeps the previous object when nothing changed, so the nodes that read it
// do not re-render on every preview event.
export function sameProblems(a: Problems, b: Problems): boolean {
  if (a === b) return true
  if (a.graph.join('\n') !== b.graph.join('\n') || a.nodes.size !== b.nodes.size) return false
  for (const [id, x] of a.nodes) {
    const y = b.nodes.get(id)
    if (!y || x.messages.join('\n') !== y.messages.join('\n')) return false
  }
  return true
}

// The node's messages that were not pinned to one of its ports or params.
export function unattributed(problems: NodeProblems): string[] {
  const pinned = new Set<string>()
  for (const list of problems.ports.values()) list.forEach((m) => pinned.add(m))
  for (const list of problems.params.values()) list.forEach((m) => pinned.add(m))
  return problems.messages.filter((m) => !pinned.has(m))
}
