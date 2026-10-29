import type { Holder } from './graph/lightTest'
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

type Reply = { ok: boolean; status: number; body: Record<string, unknown> }

async function postJson(path: string, body: unknown): Promise<Reply> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, status: res.status, body: parsed }
}

// A short reason for a refused write: the server's message, else its error code.
function refusal(reply: Reply): string {
  const { error, message, errors } = reply.body as { error?: string; message?: string; errors?: unknown[] }
  if (error === 'invalid_graph') {
    const n = Array.isArray(errors) ? errors.length : 0
    return n > 0 ? `The graph has ${n} ${n === 1 ? 'problem' : 'problems'}` : 'The graph is not valid'
  }
  if (error === 'cannot_test') return message || 'The lights cannot take this graph in place. Use Save and apply'
  if (error === 'draft_changed') return 'The graph changed since the test started. Test again, or Save and apply'
  if (error === 'no_test') return 'No test is running'
  return message || error || `HTTP ${reply.status}`
}

export type WriteResult = { ok: true; reloadError: string | null } | { ok: false; reason: string }

function written(reply: Reply): WriteResult {
  if (!reply.ok) return { ok: false, reason: refusal(reply) }
  const reload = reply.body.reloadError
  return { ok: true, reloadError: typeof reload === 'string' && reload ? reload : null }
}

// Writes the session's draft as a custom effect; the live effect stays as it is.
export async function saveGraph(session: string, id: string): Promise<WriteResult> {
  return written(await postJson('/api/graph/save', { session, id }))
}

// Writes the draft and makes it the live effect.
export async function applyGraph(session: string, id: string): Promise<WriteResult> {
  return written(await postJson('/api/graph/apply', { session, id }))
}

function holderOf(raw: unknown): Holder | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { session, client } = raw as { session?: unknown; client?: unknown }
  return typeof session === 'string' ? { session, client: typeof client === 'string' ? client : null } : null
}

export type TestInfo = { holder: Holder | null }

export async function fetchTestInfo(): Promise<TestInfo> {
  const body = await getJson<{ active?: boolean; holder?: unknown }>('/api/graph/test')
  return { holder: body.active ? holderOf(body.holder) : null }
}

export type TestStart = { ok: true; remainingMs: number; heartbeatMs: number } | { ok: false; reason: string }

export async function startTest(session: string): Promise<TestStart> {
  const reply = await postJson('/api/graph/test', { session })
  if (!reply.ok) return { ok: false, reason: refusal(reply) }
  const b = reply.body as { confirmWithinMs?: number; heartbeatMs?: number }
  return { ok: true, remainingMs: b.confirmWithinMs ?? 0, heartbeatMs: b.heartbeatMs ?? 2000 }
}

export type Beat = { running: true; remainingMs: number } | { running: false; lastEnd: string | null; holder: Holder | null }

// 404 no_test is an answer (the test is over), not a failure; anything else
// that is not OK throws.
export async function heartbeat(session: string): Promise<Beat> {
  const reply = await postJson('/api/graph/test/heartbeat', { session })
  if (reply.ok) return { running: true, remainingMs: Number(reply.body.confirmRemainingMs ?? 0) }
  if (reply.status === 404 && reply.body.error === 'no_test') {
    const lastEnd = reply.body.lastEnd
    return { running: false, lastEnd: typeof lastEnd === 'string' ? lastEnd : null, holder: holderOf(reply.body.holder) }
  }
  throw new Error(refusal(reply))
}

export type CloseResult = { ok: true; reloadError: string | null } | { ok: false; reason: string; over: boolean }

// Puts the live effect back. `over` is true when the test had already ended.
export async function revertTest(session: string): Promise<CloseResult> {
  const reply = await postJson('/api/graph/test/revert', { session })
  if (reply.ok) {
    const err = reply.body.revertError
    return { ok: true, reloadError: typeof err === 'string' && err ? err : null }
  }
  return { ok: false, reason: refusal(reply), over: reply.body.error === 'no_test' }
}

// Makes the tested graph the live effect under `id` (apply's own write).
export async function keepTest(session: string, id: string): Promise<CloseResult> {
  const reply = await postJson('/api/graph/test/confirm', { session, id })
  const result = written(reply)
  if (result.ok) return result
  return { ok: false, reason: result.reason, over: reply.body.error === 'no_test' }
}
