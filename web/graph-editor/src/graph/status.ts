// The editor's single status spot: which state it shows. The rule is the
// status priority table in [[graph-editor-cleanup]]. Pure, so every rank
// is testable without a server.

import { summarize, type LoopState } from './loop'
import { describeTest, type TestState } from './lightTest'

export type StatusRank = 1 | 3 | 4 | 5 | 6 | 7

export type Status = {
  rank: StatusRank
  label: string
  // The tooltip.
  detail: string | null
  // Where it shows now that the bar has no status text: the Test button's
  // label or tooltip, the banner under the bar, or nowhere (the problems chip
  // and the zones' stale tint already say it).
  where: 'button' | 'banner' | 'none'
  // The Test button's own label for this state.
  action: 'reconnect' | 'take-over' | null
}

export type StatusInput = {
  // Cannot reach Aurora, or cannot open the effect (rank 1, also a banner).
  openError: string | null
  loop: LoopState
  test: TestState
  // A Save or Save and apply that failed (rank 6).
  writeTrouble: string | null
  // The test outcome was shown and an edit or Save has happened since.
  testOutcomeCleared: boolean
}

// Test outcomes that are a toast, not a status.
function isQuietEnd(state: TestState): boolean {
  const r = state.ended?.reason
  // confirm_timeout is how a Once test ends on its own: a toast.
  return r === 'kept' || r === 'reverted' || r === 'confirm_timeout'
}

/** The toast for a test that ended by itself or by Stop, else null. */
export function quietEndToast(test: TestState): string | null {
  switch (test.ended?.reason) {
    case 'reverted':
      return 'Reverted'
    case 'confirm_timeout':
      return 'Test finished: the lights are back'
    default:
      return null
  }
}

// Rank 5: someone else is testing on the lights.
export function lightsInUse(test: TestState): string | null {
  if (test.phase !== 'idle' || !test.other || test.ended?.reason === 'replaced') return null
  return describeTest(test)
}

// Rank 6, test side: a test that failed or ended without the user ending it.
export function testTrouble(test: TestState): string | null {
  if (test.phase !== 'idle') return test.failure
  if (test.failure) return test.failure
  if (!test.ended || isQuietEnd(test)) return null
  if (lightsInUse(test)) return null
  return describeTest(test)
}

/** A document change that dismisses a test outcome and a write trouble: any
 *  change after an effect is open, but not the open itself (from no document). */
export function changeIsEdit(before: unknown, after: unknown): boolean {
  return before !== null && after !== null && before !== after
}

/** The Test split button's label while a test runs: Stop, with the Once countdown. */
export function stopLabel(test: TestState): string {
  if (test.mode === 'live') return 'Stop'
  const s = Math.max(0, Math.ceil(test.remainingMs / 1000))
  return `Stop ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const at = (rank: StatusRank, where: Status['where'], label: string, detail: string | null = null, action: Status['action'] = null): Status => ({ rank, where, label, detail, action })

export function pickStatus({ openError, loop, test, writeTrouble, testOutcomeCleared }: StatusInput): Status {
  // Rank 1: the banner says it; the button is disabled with this as its tooltip.
  if (openError || loop.stream === 'unreachable') return at(1, 'button', 'Cannot reach Aurora', openError ?? 'Retrying.')
  // Ranks 3 (Draft not sent) and 6 persist and need a look: the banner.
  if (loop.putError) return at(3, 'banner', 'Draft not sent', loop.putError)
  // Draft would not load is a problem with the graph: it is a Whole graph row in
  // the problems popover (graph/problems.ts draftIssues), not a banner.
  // Rank 4 and 5 are the button's own labels.
  if (loop.stream === 'replaced') return at(4, 'button', 'Reconnect', 'Another view of this session opened the preview.', 'reconnect')
  const use = lightsInUse(test)
  if (use) return at(5, 'button', 'Take over', use, 'take-over')
  const trouble = writeTrouble ?? (testOutcomeCleared ? null : testTrouble(test))
  if (trouble) return at(6, 'banner', trouble)
  // Preview state (Preview paused, Connecting, Live) is no longer text: problems
  // are the chip's job and the zones island tints when stale.
  if (loop.valid === false) return at(7, 'none', 'Preview paused', 'Fix the problems to update the preview.')
  const line = summarize(loop)
  return at(7, 'none', line.label, line.detail)
}

// The banner under the bar: only what blocks work or waits for an answer.
export type Banner = { kind: 'unreachable'; message: string } | { kind: 'restore' } | { kind: 'notice'; message: string; detail: string | null }

export function pickBanner(openError: string | null, hasOffer: boolean, status?: Status): Banner | null {
  if (openError) return { kind: 'unreachable', message: openError }
  if (hasOffer) return { kind: 'restore' }
  if (status?.where === 'banner') return { kind: 'notice', message: status.label, detail: status.detail }
  return null
}
