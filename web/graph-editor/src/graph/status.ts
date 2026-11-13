// The editor's single status spot: which state it shows. The rule is the
// status priority table in [[graph-editor-cleanup]]. Pure, so every rank
// is testable without a server.

import { summarize, type LoopState } from './loop'
import { describeTest, initialTest, lightsInUseText, type Holder, type TestState } from './lightTest'

export type StatusRank = 1 | 4 | 5 | 6 | 7

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
  // The effect or catalog would not load although Aurora answers (rank 1, a banner with Retry).
  openError: string | null
  // Aurora cannot be reached: the one verdict, from the host-state poll that also raises
  // the shell's takeover (rank 1; the Test button is off with it).
  unreachable: boolean
  loop: LoopState
  test: TestState
  // Another session's test, from the host-state poll (the same source as the shell's
  // light-test row), or null. Rank 5.
  otherHolder: Holder | null
  // A Save or Save and apply that failed (rank 6).
  writeTrouble: string | null
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

// Rank 5: someone else is testing on the lights. Only offered when this tab is idle.
export function lightsInUse(test: TestState, otherHolder: Holder | null): string | null {
  return test.phase === 'idle' && otherHolder ? lightsInUseText(otherHolder) : null
}

// Why a test ended for a reason the user did not cause, else null. Announced and kept as
// the first line of the Test caret menu; it never draws on the button and is not a status.
// Kept, Reverted and the end of a Once test are the user's own and are toasts; unreachable
// is the "Aurora has stopped" takeover; a null reason is a Stop that found the test over.
export function testOutcome(test: TestState): string | null {
  if (test.phase !== 'idle') return null
  switch (test.ended?.reason) {
    case 'replaced':
    case 'heartbeat_lost':
    case 'stopped':
    case 'superseded':
    case 'pipeline_gone':
      return describeTest({ ...initialTest, ended: test.ended })
    default:
      return null
  }
}

/** The toast for a Test the server refused to start (or a Stop it refused): its own failure text. */
export function testFailureToast(test: TestState): string | null {
  return test.phase === 'idle' || test.phase === 'running' ? test.failure : null
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

export function pickStatus({ openError, unreachable, loop, test, otherHolder, writeTrouble }: StatusInput): Status {
  // Rank 1: the takeover (or the banner for an effect that would not open) says it; the button
  // is disabled with this as its tooltip. A lost preview stream alone is not this: it only
  // asks the host poll to look (useDraftLoop), which owns the verdict.
  if (unreachable || openError) return at(1, 'button', 'Cannot reach Aurora', openError ?? 'Retrying.')
  // Draft not sent is split by the server's error code: the error shell shows the editor-supplied
  // rows (graph/hostState.ts draftShellNote), and a too-large draft is a Whole graph problem.
  // Draft would not load is a problem with the graph: it is a Whole graph row in
  // the problems popover (graph/problems.ts draftIssues), not a banner.
  // Rank 4 and 5 are the button's own labels.
  if (loop.stream === 'replaced') return at(4, 'button', 'Reconnect', 'Another view of this session opened the preview.', 'reconnect')
  const use = lightsInUse(test, otherHolder)
  if (use) return at(5, 'button', 'Take over', use, 'take-over')
  // Rank 6 is a failed Save for now; test outcomes moved to the live region and the Test menu
  // (testOutcome), and a failed start is a toast (6c). 6f removes the banner path.
  if (writeTrouble) return at(6, 'banner', writeTrouble)
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
