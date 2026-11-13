// What the editor reads from GET /api/state for the error shell, and the pure rules around it.
// The Dashboard's web/ui/shell.js reads the same endpoint the same way (Aurora-cj11); the
// markup test in ErrorShell.test.tsx keeps the two in step.

import type { Holder } from './lightTest'

export type HostError = { source: string; message: string; id?: number; retry?: boolean }
export type HostCondition = { source: string; message: string }

export type HostSnapshot = {
  // idle | running | paused | failed
  state: string | null
  errors: HostError[]
  // Standing facts (a missing permission), not failures.
  conditions: HostCondition[]
  // A light test is running somewhere; `remainingMs` is null for a Live one (no deadline).
  test: { active: boolean; remainingMs: number | null; holder: Holder | null }
}

export const emptyHost: HostSnapshot = { state: null, errors: [], conditions: [], test: { active: false, remainingMs: null, holder: null } }

function entries<T extends { source: string }>(raw: unknown): T[] {
  return Array.isArray(raw) ? raw.filter((e): e is T => typeof e === 'object' && e !== null && typeof (e as T).source === 'string') : []
}

// A body that is missing or malformed reads as "nothing to show", never throws.
export function parseHostState(body: unknown): HostSnapshot {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const test = (typeof b.test === 'object' && b.test !== null ? b.test : {}) as { active?: unknown; confirmRemainingMs?: unknown; holder?: unknown }
  const active = test.active === true
  const rawHolder = typeof test.holder === 'object' && test.holder !== null ? (test.holder as { session?: unknown; client?: unknown }) : null
  const holder: Holder | null = active && rawHolder && typeof rawHolder.session === 'string' ? { session: rawHolder.session, client: typeof rawHolder.client === 'string' ? rawHolder.client : null } : null
  const remaining = Number(test.confirmRemainingMs)
  return {
    state: typeof b.state === 'string' ? b.state : null,
    errors: entries<HostError>(b.errors),
    conditions: entries<HostCondition>(b.conditions),
    test: { active, remainingMs: active && test.confirmRemainingMs !== null && Number.isFinite(remaining) ? remaining : null, holder },
  }
}

// Unreachable the way shell.js counts it: a network error, abort or timeout. Any HTTP answer
// is reachable. One failed poll is a blip; the second in a row raises the takeover.
export const FAILURE_THRESHOLD = 2

export type Reach = { failures: number; down: boolean }
export const reachable: Reach = { failures: 0, down: false }

export function reachAfter(prev: Reach, answered: boolean): Reach {
  if (answered) return reachable
  const failures = prev.failures + 1
  return { failures, down: prev.down || failures >= FAILURE_THRESHOLD }
}

// The test row is another session's: hidden while the active test is this tab's own.
export function otherTest(test: HostSnapshot['test'], session: string): HostSnapshot['test'] | null {
  return test.active && test.holder?.session !== session ? test : null
}

// Editor-supplied shell rows for a refused draft PUT, by the server's error code
// (DraftRoutes.cpp). None carries Retry or a dismiss X; they clear when a later send
// succeeds (loopReducer's 'put'). draft_too_large is not a row: see problems.ts.
export const TOO_MANY_DRAFTS_MESSAGE = "Couldn't check your last edit: too many editors are open. Close one to continue."
export const CHECK_FAILED_MESSAGE = "Couldn't check your last edit."

export function draftShellNote(putError: string | null): string | null {
  if (!putError || putError === 'draft_too_large') return null
  return putError === 'too_many_drafts' ? TOO_MANY_DRAFTS_MESSAGE : CHECK_FAILED_MESSAGE
}
