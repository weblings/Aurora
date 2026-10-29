import type { ServerIssue } from './graph/problems'
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

export type DraftVerdict = { valid: boolean; errors: ServerIssue[] }

// Sends the whole document as this tab's draft. The server saves it even when
// invalid and answers with its validation; any other failure throws a short
// reason (too_many_drafts, draft_too_large, ...).
export async function putDraft(session: string, graph: GraphDoc, signal?: AbortSignal): Promise<DraftVerdict> {
  const res = await fetch(`/api/graph/drafts/${encodeURIComponent(session)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph }),
    signal,
  })
  const body = (await res.json().catch(() => ({}))) as { valid?: boolean; errors?: ServerIssue[]; error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return { valid: body.valid === true, errors: body.errors ?? [] }
}

export function previewUrl(session: string): string {
  return `/api/graph/preview?session=${encodeURIComponent(session)}`
}
