import { splitEndpoint } from './doc'
import type { Catalog, GraphDoc, ParamValue } from './types'

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

  if (out.type !== input.type) return `${out.type} output cannot feed a ${input.type} input`

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
