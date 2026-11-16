import { problemCopy } from '../../ui/problemCopy.js'
import { parseZoneRegions, type ZoneRegions } from './graph/frame'
import { setPortMeanings } from './graph/portStyle'
import { readAreaCache, writeAreaCache } from './graph/previewLayout'
import type { Holder } from './graph/lightTest'
import type { ServerIssue } from './graph/problems'
import type { Catalog, EffectListEntry, GraphDoc, NodeTypeInfo } from './graph/types'

// Root-absolute on purpose: Aurora's REST API ignores the editor's base.
// A GET the server answered with an error carries its status and the body's `error` code
// (unknown_effect, unreadable_effect), else code ''. A network failure or an unparseable
// success body is fetch's / json()'s own error, as before.
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(path: string, status: number, code: string) {
    super(`${path}: ${status}`)
    this.status = status
    this.code = code
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: unknown }
    throw new ApiError(path, res.status, typeof body.error === 'string' ? body.error : '')
  }
  return (await res.json()) as T
}

export async function fetchCatalog(): Promise<Catalog> {
  const { nodes, portTypes } = await getJson<{ nodes: NodeTypeInfo[]; portTypes?: { name: string; meaning: string }[] }>('/api/nodes')
  setPortMeanings(portTypes ?? [])
  return new Map(nodes.map((n) => [n.type, n]))
}

export async function fetchEffects(): Promise<EffectListEntry[]> {
  return (await getJson<{ effects: EffectListEntry[] }>('/api/effects')).effects
}

// The dashboard reads the same fields: any audio input means Music pulse can run,
// and the platform decides how the error shell words a macOS permission row.
export async function fetchCapabilities(): Promise<{ hasAudio: boolean; platform: string }> {
  try {
    const body = await getJson<{ audioInputs?: unknown[]; platform?: unknown }>('/api/capabilities')
    return { hasAudio: (body.audioInputs ?? []).length > 0, platform: typeof body.platform === 'string' ? body.platform : '' }
  } catch {
    return { hasAudio: false, platform: '' }
  }
}

// Shipped builds report Release or MinSizeRel; a failed or older reply counts as shipped, so ids stay hidden.
export async function fetchShowNodeIds(): Promise<boolean> {
  try {
    const { buildType } = await getJson<{ buildType?: unknown }>('/api/version')
    return typeof buildType === 'string' && buildType !== '' && buildType !== 'Release' && buildType !== 'MinSizeRel'
  } catch {
    return false
  }
}

export async function fetchEffectGraph(id: string): Promise<GraphDoc> {
  return (await getJson<{ graph: GraphDoc }>(`/api/effects/${encodeURIComponent(id)}`)).graph
}

// Where the active output's zones sample the screen; null when unavailable.
export async function fetchZoneRegions(): Promise<ZoneRegions | null> {
  return parseZoneRegions(await getJson<unknown>('/api/zones'))
}

export type DraftVerdict = { valid: boolean; errors: ServerIssue[] }

// The server answered the draft PUT with an error: `code` is its error code
// (too_many_drafts, draft_too_large, invalid_session, invalid_body), else http_<status>.
// A network failure is not this: fetch's own error passes through.
export class DraftRefused extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

// Sends the whole document as this tab's draft. The server saves it even when
// invalid and answers with its validation; any other answer throws DraftRefused.
export async function putDraft(session: string, graph: GraphDoc, signal?: AbortSignal): Promise<DraftVerdict> {
  const res = await fetch(`/api/graph/drafts/${encodeURIComponent(session)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph }),
    signal,
  })
  const body = (await res.json().catch(() => ({}))) as { valid?: boolean; errors?: ServerIssue[]; error?: string }
  if (!res.ok) throw new DraftRefused(body.error ?? `http_${res.status}`)
  return { valid: body.valid === true, errors: body.errors ?? [] }
}

// `layout` is a sim's name (graph/previewLayout.ts layoutQuery); none draws the lights' own zones.
export function previewUrl(session: string, layout: string | null = null): string {
  return `/api/graph/preview?session=${encodeURIComponent(session)}${layout ? `&layout=${encodeURIComponent(layout)}` : ''}`
}

// What the Preview layout menu can offer, from GET /api/graph/preview/layouts; null when unavailable.
export async function fetchPreviewLayouts(): Promise<{ output: string; savedZones: number } | null> {
  try {
    const body = await getJson<{ output?: unknown; savedZones?: unknown }>('/api/graph/preview/layouts')
    return { output: typeof body.output === 'string' ? body.output : '', savedZones: Number(body.savedZones) || 0 }
  } catch {
    return null
  }
}

// The name of the Hue entertainment area in use, for the real layout; null when none is chosen or it
// cannot be told. The bridge lists names, so with it down the last name read stands in (cached by id).
export async function fetchHueAreaName(): Promise<string | null> {
  let id = ''
  try {
    const connection = await getJson<{ entertainmentConfigurationId?: unknown }>('/api/hue/connection')
    id = typeof connection.entertainmentConfigurationId === 'string' ? connection.entertainmentConfigurationId : ''
  } catch {
    return null
  }
  if (!id) return null
  try {
    const res = await fetch('/api/hue/entertainment-configurations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const body = (await res.json()) as { configurations?: { id?: unknown; name?: unknown }[] }
    const found = (body.configurations ?? []).find((c) => c.id === id)
    if (found && typeof found.name === 'string' && found.name) {
      writeAreaCache({ id, name: found.name })
      return found.name
    }
  } catch {
    // Bridge down: fall back to the cached name below.
  }
  const cached = readAreaCache()
  return cached && cached.id === id ? cached.name : null
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

// A short reason for a refused write: our words for its error code (web/ui/problemCopy.js), else the
// server's message, else the code.
function refusal(reply: Reply): string {
  const { error, message, errors } = reply.body as { error?: string; message?: string; errors?: unknown[] }
  if (error === 'invalid_graph') {
    const n = Array.isArray(errors) ? errors.length : 0
    return n > 0 ? `The graph has ${n} ${n === 1 ? 'problem' : 'problems'}` : 'The graph is not valid'
  }
  if (error === 'cannot_test') return message || 'The lights cannot take this graph in place. Use Save and apply'
  return problemCopy(error, {}, message || error || `HTTP ${reply.status}`)
}

// A failed reload after a write is not reported here: Aurora records it in
// /api/state errors and the error shell shows it, as on the Dashboard.
export type WriteResult = { ok: true } | { ok: false; reason: string }

function written(reply: Reply): WriteResult {
  return reply.ok ? { ok: true } : { ok: false, reason: refusal(reply) }
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

export type TestStart = { ok: true; remainingMs: number; heartbeatMs: number } | { ok: false; reason: string }

export async function startTest(session: string, mode: 'once' | 'live' = 'once'): Promise<TestStart> {
  const reply = await postJson('/api/graph/test', { session, mode })
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
