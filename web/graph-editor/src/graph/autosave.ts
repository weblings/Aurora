import type { GraphDoc } from './types'
import { sameDoc } from './history'

// Unsaved edits survive a reload in browser storage, one copy per effect id.
// A copy records which saved version it was based on (a fingerprint of the
// baseline graph), so opening can tell that the saved effect changed since
// (Aurora-u68h.2). Copies written before that hold the bare graph: they have no
// base and restore without a question.
// Storage can be missing, full or blocked (private windows, site settings), so
// every call swallows failure and the editor works without it.

const PREFIX = 'aurora.graphEditor.unsaved.'
const LEGACY_BLANK_ID = '@empty'

function store(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// A short stable fingerprint of a graph (FNV-1a over its JSON): enough to tell
// "the saved effect is the one this copy was made from" without storing it twice.
export function fingerprint(doc: GraphDoc): string {
  const text = JSON.stringify(doc)
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

export type KeptCopy = { doc: GraphDoc; base: string | null }

// `base` is the fingerprint of the saved graph the edits were made from, or null when unknown.
export function saveUnsaved(effectId: string, doc: GraphDoc, base: string | null, storage: Storage | null = store()): void {
  try {
    storage?.setItem(PREFIX + effectId, JSON.stringify({ v: 2, base, doc }))
  } catch {
    // Quota or blocked: the edit simply is not backed up.
  }
}

export function clearUnsaved(effectId: string, storage: Storage | null = store()): void {
  try {
    storage?.removeItem(PREFIX + effectId)
  } catch {
    // Nothing to clear.
  }
}

const isGraph = (g: unknown): g is GraphDoc => Array.isArray((g as GraphDoc)?.nodes) && Array.isArray((g as GraphDoc)?.edges)

export function loadKept(effectId: string, storage: Storage | null = store()): KeptCopy | null {
  try {
    const raw = storage?.getItem(PREFIX + effectId)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { v?: number; base?: unknown; doc?: unknown } & Partial<GraphDoc>
    if (parsed?.v === 2) {
      return isGraph(parsed.doc) ? { doc: parsed.doc, base: typeof parsed.base === 'string' ? parsed.base : null } : null
    }
    return isGraph(parsed) ? { doc: parsed as GraphDoc, base: null } : null
  } catch {
    return null
  }
}

export function loadUnsaved(effectId: string, storage: Storage | null = store()): GraphDoc | null {
  return loadKept(effectId, storage)?.doc ?? null
}

// What opening an effect does with its kept copy. `none`: nothing worth keeping
// (no copy, or it equals the server's graph, which is then cleared). `restore`:
// put the copy back, silently. `newer`: the saved effect changed since the copy
// was made (an MCP apply, a Save in another tab), so the copy is out of date and
// the person picks (Aurora-u68h.2).
export type OpenKept = { kind: 'none' } | { kind: 'restore'; doc: GraphDoc } | { kind: 'newer'; doc: GraphDoc }

export function openKept(effectId: string, server: GraphDoc, storage: Storage | null = store()): OpenKept {
  const kept = loadKept(effectId, storage)
  if (!kept) return { kind: 'none' }
  if (sameDoc(kept.doc, server)) {
    clearUnsaved(effectId, storage)
    return { kind: 'none' }
  }
  if (kept.base !== null && kept.base !== fingerprint(server)) return { kind: 'newer', doc: kept.doc }
  return { kind: 'restore', doc: kept.doc }
}

// The unsaved state the top bar draws from (the dot in 6d): the open graph
// differs from the saved baseline.
export function isUnsaved(baseline: GraphDoc | null, doc: GraphDoc | null): boolean {
  return baseline !== null && doc !== null && !sameDoc(baseline, doc)
}

// Keeps the stored copy in step with the document: present while it differs
// from the saved baseline, gone once they match (after a save).
export function syncUnsaved(effectId: string, baseline: GraphDoc, doc: GraphDoc, storage: Storage | null = store()): void {
  if (sameDoc(baseline, doc)) clearUnsaved(effectId, storage)
  else saveUnsaved(effectId, doc, fingerprint(baseline), storage)
}

// A legacy '@empty' copy (before each new effect had its own id) moves to a
// fresh '@new-' id, so nothing typed there is lost. Returns that id, or null
// when there was none.
export function migrateLegacyBlank(freshId: () => string, storage: Storage | null = store()): string | null {
  const legacy = loadKept(LEGACY_BLANK_ID, storage)
  if (!legacy) return null
  clearUnsaved(LEGACY_BLANK_ID, storage)
  const id = freshId()
  saveUnsaved(id, legacy.doc, null, storage)
  return id
}
