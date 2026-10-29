import type { Catalog, EffectListEntry, GraphDoc, NodeTypeInfo } from './graph/types'

// Root-absolute on purpose: Aurora's REST API ignores the editor's base.
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return (await res.json()) as T
}

export async function fetchCatalog(): Promise<Catalog> {
  const { nodes } = await getJson<{ nodes: NodeTypeInfo[] }>('/api/nodes')
  return new Map(nodes.map((n) => [n.type, n]))
}

export async function fetchEffects(): Promise<EffectListEntry[]> {
  return (await getJson<{ effects: EffectListEntry[] }>('/api/effects')).effects
}

export async function fetchEffectGraph(id: string): Promise<GraphDoc> {
  return (await getJson<{ graph: GraphDoc }>(`/api/effects/${encodeURIComponent(id)}`)).graph
}
