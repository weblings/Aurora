import type { GraphDoc } from './types'
import { sameDoc } from './history'

// Unsaved edits survive a reload in browser storage, one copy per effect id.
// Storage can be missing, full or blocked (private windows, site settings), so
// every call swallows failure and the editor works without it.

const PREFIX = 'aurora.graphEditor.unsaved.'

function store(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function saveUnsaved(effectId: string, doc: GraphDoc, storage: Storage | null = store()): void {
  try {
    storage?.setItem(PREFIX + effectId, JSON.stringify(doc))
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

export function loadUnsaved(effectId: string, storage: Storage | null = store()): GraphDoc | null {
  try {
    const raw = storage?.getItem(PREFIX + effectId)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GraphDoc
    return Array.isArray(parsed?.nodes) && Array.isArray(parsed?.edges) ? parsed : null
  } catch {
    return null
  }
}

// A stored copy worth offering back: one that differs from what the server has.
export function restorable(effectId: string, server: GraphDoc, storage: Storage | null = store()): GraphDoc | null {
  const stored = loadUnsaved(effectId, storage)
  if (!stored) return null
  if (sameDoc(stored, server)) {
    clearUnsaved(effectId, storage)
    return null
  }
  return stored
}

// Keeps the stored copy in step with the document: present while it differs
// from the saved baseline, gone once they match (after a save).
export function syncUnsaved(effectId: string, baseline: GraphDoc, doc: GraphDoc, storage: Storage | null = store()): void {
  if (sameDoc(baseline, doc)) clearUnsaved(effectId, storage)
  else saveUnsaved(effectId, doc, storage)
}
