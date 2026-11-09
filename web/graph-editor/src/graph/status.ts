// The editor's single status spot: which state it shows. The rule is the
// status priority table in docs/planning/WebUI/GraphEditorCleanup.md. Pure, so
// every rank is testable without a server.

import { summarize, type LoopState } from './loop'
import { describeTest, type TestState } from './lightTest'

export type StatusRank = 1 | 3 | 4 | 5 | 6 | 7

export type Status = {
  rank: StatusRank
  label: string
  // The tooltip.
  detail: string | null
  // A button the status spot carries.
  action: 'reconnect' | null
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
  return state.ended?.reason === 'kept' || state.ended?.reason === 'reverted'
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

// What a running test says beside Revert: the countdown, or what it is doing.
export function testProgress(test: TestState): string | null {
  switch (test.phase) {
    case 'starting':
      return 'Starting the test'
    case 'closing':
      return 'Working'
    case 'running':
      return `Testing, ${Math.ceil(test.remainingMs / 1000)} s left`
    case 'idle':
      return null
  }
}

export function pickStatus({ openError, loop, test, writeTrouble, testOutcomeCleared }: StatusInput): Status {
  if (openError || loop.stream === 'unreachable') {
    return { rank: 1, label: 'Aurora unreachable', detail: openError ?? 'Retrying.', action: null }
  }
  if (loop.putError) return { rank: 3, label: 'Draft not sent', detail: loop.putError, action: null }
  if (loop.reloadError) return { rank: 3, label: 'Draft would not load', detail: loop.reloadError, action: null }
  if (loop.stream === 'replaced') {
    return { rank: 4, label: 'Preview taken over', detail: 'Another view of this session opened the preview.', action: 'reconnect' }
  }
  const use = lightsInUse(test)
  if (use) return { rank: 5, label: use, detail: null, action: null }
  const trouble = writeTrouble ?? (testOutcomeCleared ? null : testTrouble(test))
  if (trouble) return { rank: 6, label: trouble, detail: null, action: null }
  // Problems with the graph are the chip's job; the preview is stale meanwhile.
  if (loop.valid === false) return { rank: 7, label: 'Preview paused', detail: 'Fix the problems to update the preview.', action: null }
  const line = summarize(loop)
  return { rank: 7, label: line.label, detail: line.detail, action: null }
}

// The banner under the bar: only what blocks work or waits for an answer.
export type Banner = { kind: 'unreachable'; message: string } | { kind: 'restore' }

export function pickBanner(openError: string | null, hasOffer: boolean): Banner | null {
  if (openError) return { kind: 'unreachable', message: openError }
  if (hasOffer) return { kind: 'restore' }
  return null
}
