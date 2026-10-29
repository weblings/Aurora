// State of a test on the real lights, as a pure reducer like loop.ts. The hook
// in `useLightTest.ts` turns server answers and timers into these events.

// Who runs a test: the draft session, and the X-Aurora-Client ("mcp" for an
// agent, null for a WebUI tab).
export type Holder = { session: string; client: string | null }

export type TestEnd = {
  // The server's lastEnd, or one of ours: kept, reverted, unreachable.
  reason: string | null
  // Who held the lights when it ended (the new holder after "replaced").
  holder: Holder | null
}

export type TestState = {
  phase: 'idle' | 'starting' | 'running' | 'closing'
  remainingMs: number
  // Someone else's test, seen while idle.
  other: Holder | null
  // Why the last test is over; kept until the next one starts.
  ended: TestEnd | null
  // A start, keep or revert the server refused.
  failure: string | null
}

export const initialTest: TestState = { phase: 'idle', remainingMs: 0, other: null, ended: null, failure: null }

export type TestEvent =
  | { type: 'seen'; holder: Holder | null }
  | { type: 'starting' }
  | { type: 'started'; remainingMs: number }
  | { type: 'start-failed'; message: string }
  | { type: 'beat'; remainingMs: number }
  | { type: 'tick'; ms: number }
  | { type: 'ended'; end: TestEnd }
  | { type: 'closing' }
  | { type: 'closed'; kind: 'kept' | 'reverted' }
  // Keep or revert refused: the test is still running.
  | { type: 'close-failed'; message: string }

export function testReducer(state: TestState, event: TestEvent): TestState {
  switch (event.type) {
    case 'seen':
      return state.phase === 'idle' ? { ...state, other: event.holder } : state
    case 'starting':
      return { ...state, phase: 'starting', failure: null, ended: null, other: null }
    case 'started':
      return { ...state, phase: 'running', remainingMs: event.remainingMs }
    case 'start-failed':
      return { ...state, phase: 'idle', failure: event.message }
    case 'beat':
      return state.phase === 'running' ? { ...state, remainingMs: event.remainingMs } : state
    case 'tick':
      return state.phase === 'running' ? { ...state, remainingMs: Math.max(0, state.remainingMs - event.ms) } : state
    case 'ended':
      // Whatever phase it was in, the test is over; a taker is someone else's.
      return { ...state, phase: 'idle', remainingMs: 0, ended: event.end, other: event.end.reason === 'replaced' ? event.end.holder : null }
    case 'closing':
      return state.phase === 'running' ? { ...state, phase: 'closing', failure: null } : state
    case 'closed':
      return { ...state, phase: 'idle', remainingMs: 0, ended: { reason: event.kind, holder: null } }
    case 'close-failed':
      return { ...state, phase: 'running', failure: event.message }
  }
}

function who(holder: Holder | null): string {
  if (!holder) return 'another session'
  return holder.client === 'mcp' ? 'an agent' : 'another editor tab or window'
}

// One sentence for the toolbar, or null when there is nothing to say.
export function describeTest(state: TestState): string | null {
  if (state.failure) return state.failure
  switch (state.phase) {
    case 'starting':
      return 'Starting the test'
    case 'closing':
      return 'Working'
    case 'running':
      return `Testing on the lights, ${Math.ceil(state.remainingMs / 1000)} s left`
    case 'idle':
      break
  }
  const end = state.ended
  // The taker is also `other`; the sentence about the loss comes first.
  if (state.other && end?.reason !== 'replaced') return `Lights in use: ${who(state.other)} is testing`
  if (!end) return null
  switch (end.reason) {
    case 'replaced':
      return `Test ended: ${who(end.holder)} took the lights`
    case 'kept':
      return 'Kept: the tested graph is the live effect'
    case 'reverted':
      return 'Reverted: the lights are back as they were'
    case 'heartbeat_lost':
      return 'Test ended: Aurora stopped hearing from this tab. The lights are back'
    case 'confirm_timeout':
      return 'Test ended at its time limit. The lights are back'
    case 'stopped':
      return 'Test stopped from the Dashboard. The lights are back'
    case 'superseded':
      return 'Test ended: another effect was chosen'
    case 'pipeline_gone':
      return 'Test ended: the lights were paused or restarted'
    case 'unreachable':
      return 'Lost contact with Aurora. It puts the lights back by itself'
    default:
      return 'Test ended'
  }
}
