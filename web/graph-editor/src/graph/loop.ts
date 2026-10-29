// State of the draft -> validate -> preview loop, as a pure reducer so every
// state is testable without a server. The hook in `useDraftLoop.ts` turns
// network happenings into these events.

import type { PreviewIssue, ServerIssue } from './problems'

export type StreamState =
  | 'closed' // no stream yet (no valid draft sent) or deliberately stopped
  | 'connecting'
  | 'live'
  | 'paused' // the lights are paused or no pipeline runs (pipeline_gone, cannot_preview)
  | 'replaced' // another stream took this session's preview; not reopened on its own
  | 'unreachable' // Aurora cannot be reached

export type LoopState = {
  // Verdict of the last draft the server accepted; null before the first.
  valid: boolean | null
  issues: ServerIssue[]
  // The draft was refused outright (too many drafts, too large, offline).
  putError: string | null
  stream: StreamState
  // Why the stream is not live (server message), when it has one.
  streamNote: string | null
  // The server kept the previous preview because the new draft would not load.
  reloadError: string | null
  runtime: PreviewIssue[]
}

export const initialLoop: LoopState = {
  valid: null,
  issues: [],
  putError: null,
  stream: 'closed',
  streamNote: null,
  reloadError: null,
  runtime: [],
}

export type LoopEvent =
  | { type: 'reset' }
  | { type: 'put'; valid: boolean; issues: ServerIssue[] }
  | { type: 'put-failed'; reason: string }
  | { type: 'opening' }
  | { type: 'frame'; errors: PreviewIssue[] }
  // `event: ended` with its reason, or `event: error` with its code.
  | { type: 'ended'; reason: string }
  | { type: 'refused'; error: string; message: string }
  | { type: 'draft-invalid'; message: string }
  | { type: 'lost' }

export function loopReducer(state: LoopState, event: LoopEvent): LoopState {
  switch (event.type) {
    case 'reset':
      return initialLoop
    case 'put':
      return { ...state, valid: event.valid, issues: event.issues, putError: null, reloadError: null }
    case 'put-failed':
      return { ...state, putError: event.reason }
    case 'opening':
      return { ...state, stream: 'connecting', streamNote: null }
    case 'frame':
      return { ...state, stream: 'live', streamNote: null, runtime: event.errors }
    case 'draft-invalid':
      return { ...state, reloadError: event.message }
    case 'lost':
      return { ...state, stream: 'unreachable', streamNote: null, runtime: [] }
    case 'ended':
      if (event.reason === 'replaced') return { ...state, stream: 'replaced', streamNote: null, runtime: [] }
      // pipeline_gone: rebuilt (reconnect soon) or paused (reconnect fails with
      // cannot_preview, which keeps it paused). draft_deleted: the server
      // dropped the draft; the hook re-sends it.
      return { ...state, stream: event.reason === 'draft_deleted' ? 'closed' : 'paused', streamNote: null, runtime: [] }
    case 'refused':
      if (event.error === 'cannot_preview') return { ...state, stream: 'paused', streamNote: event.message || null, runtime: [] }
      // no_draft / invalid_session: the draft is gone or never landed; re-send.
      return { ...state, stream: 'closed', streamNote: event.message || event.error, runtime: [] }
  }
}

export type Summary = { label: string; detail: string | null }

// One line for the header. Order matters: a problem with the document hides
// stream details, because the preview shown is then stale.
export function summarize(state: LoopState): Summary {
  if (state.putError) return { label: 'Draft not sent', detail: state.putError }
  if (state.valid === false) {
    const n = state.issues.length
    return { label: `${n} ${n === 1 ? 'problem' : 'problems'}`, detail: 'Fix them to update the preview.' }
  }
  if (state.reloadError) return { label: 'Draft would not load', detail: state.reloadError }
  switch (state.stream) {
    case 'live':
      return { label: 'Live preview', detail: null }
    case 'connecting':
      return { label: 'Connecting', detail: null }
    case 'paused':
      return { label: 'Preview paused', detail: state.streamNote ?? 'The lights are paused. Resume them to preview.' }
    case 'replaced':
      return { label: 'Preview taken over', detail: 'Another view of this session opened the preview.' }
    case 'unreachable':
      return { label: 'Aurora unreachable', detail: 'Retrying.' }
    case 'closed':
      return { label: state.valid === null ? 'No draft yet' : 'Preview off', detail: state.streamNote }
  }
}

// Milliseconds before reopening a stream that ended, or null for "do not".
export function reopenDelay(state: LoopState): number | null {
  switch (state.stream) {
    case 'paused':
      return 2000
    case 'unreachable':
      return 3000
    case 'closed':
      return state.valid === true ? 500 : null
    default:
      return null
  }
}
