import { useCallback, useEffect, useReducer, useRef } from 'react'
import { heartbeat, revertTest, startTest } from './api'
import { initialTest, testReducer, type TestMode, type TestState } from './graph/lightTest'
import type { DraftVerdict } from './api'

const TICK_MS = 1000
// Heartbeats that failed in a row before the tab gives up on the test. The
// server reverts by itself after 6 s of silence, so this only changes the label.
const LOST_AFTER = 3

export type LightTest = {
  state: TestState
  // Sends the draft, then starts a test of it.
  start: (mode: TestMode) => Promise<void>
  // Re-sends the draft to the running test, so edits reach the lights (the time limit keeps running).
  push: () => Promise<boolean>
  // Ends the test after the graph was applied (apply leaves it running): the
  // server rebuilds the live effect, which is now the tested graph, from disk.
  finishAfterApply: () => Promise<void>
  revert: () => Promise<void>
}

// Runs one test on the lights for this tab: heartbeats while it lasts, a
// countdown between them. Who else holds the lights is useHostState's to say. `sendDraft` must leave the server's draft
// equal to the document being tested.
export function useLightTest(session: string, sendDraft: () => Promise<DraftVerdict>): LightTest {
  const [state, dispatch] = useReducer(testReducer, initialTest)
  const phase = useRef(state.phase)
  phase.current = state.phase
  const heartbeatMs = useRef(2000)
  const send = useRef(sendDraft)
  send.current = sendDraft

  // While running: heartbeat, and count down between answers.
  const running = state.phase === 'running'
  useEffect(() => {
    if (!running) return
    let failures = 0
    let stopped = false
    const tick = window.setInterval(() => dispatch({ type: 'tick', ms: TICK_MS }), TICK_MS)
    const beat = window.setInterval(() => {
      heartbeat(session)
        .then((answer) => {
          if (stopped) return
          failures = 0
          if (answer.running) dispatch({ type: 'beat', remainingMs: answer.remainingMs })
          else dispatch({ type: 'ended', end: { reason: answer.lastEnd, holder: answer.holder } })
        })
        .catch(() => {
          if (stopped) return
          failures += 1
          if (failures >= LOST_AFTER) dispatch({ type: 'ended', end: { reason: 'unreachable', holder: null } })
        })
    }, heartbeatMs.current)
    return () => {
      stopped = true
      window.clearInterval(tick)
      window.clearInterval(beat)
    }
  }, [running, session])

  // Leaving the page puts the lights back at once instead of after the lapse.
  useEffect(() => {
    const leave = () => {
      if (phase.current !== 'running') return
      void fetch('/api/graph/test/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session }),
        keepalive: true,
      })
    }
    window.addEventListener('pagehide', leave)
    return () => window.removeEventListener('pagehide', leave)
  }, [session])

  const start = useCallback(async (mode: TestMode) => {
    dispatch({ type: 'starting', mode })
    try {
      const verdict = await send.current()
      if (!verdict.valid) {
        dispatch({ type: 'start-failed', message: 'Fix the problems before testing' })
        return
      }
      const started = await startTest(session, mode)
      if (!started.ok) {
        dispatch({ type: 'start-failed', message: started.reason })
        return
      }
      heartbeatMs.current = Math.max(500, started.heartbeatMs)
      dispatch({ type: 'started', remainingMs: started.remainingMs })
    } catch (e) {
      dispatch({ type: 'start-failed', message: (e as Error).message })
    }
  }, [session])

  // Puts the edited draft on the lights while the test runs. Resolves true when sent.
  // Edits during a send fold into one more send.
  const busy = useRef(false)
  const again = useRef(false)
  const mode = useRef(state.mode)
  mode.current = state.mode
  const push = useCallback(async (): Promise<boolean> => {
    if (phase.current !== 'running') return false
    if (busy.current) {
      again.current = true
      return false
    }
    busy.current = true
    let sent = false
    try {
      do {
        again.current = false
        const verdict = await send.current()
        if (!verdict.valid || phase.current !== 'running') continue
        const started = await startTest(session, mode.current)
        if (started.ok) sent = true
      } while (again.current)
    } catch {
      // The running test keeps its last graph, and the heartbeat reports a lost server.
    } finally {
      busy.current = false
    }
    return sent
  }, [session])

  const finishAfterApply = useCallback(async () => {
    dispatch({ type: 'closing' })
    try {
      const result = await revertTest(session)
      if (result.ok) dispatch({ type: 'closed', kind: 'kept' })
      else if (result.over) dispatch({ type: 'ended', end: { reason: null, holder: null } })
      else dispatch({ type: 'close-failed', message: result.reason })
    } catch (e) {
      dispatch({ type: 'close-failed', message: (e as Error).message })
    }
  }, [session])

  const revert = useCallback(async () => {
    dispatch({ type: 'closing' })
    try {
      const result = await revertTest(session)
      if (result.ok) dispatch({ type: 'closed', kind: 'reverted' })
      else if (result.over) dispatch({ type: 'ended', end: { reason: null, holder: null } })
      else dispatch({ type: 'close-failed', message: result.reason })
    } catch (e) {
      dispatch({ type: 'close-failed', message: (e as Error).message })
    }
  }, [session])

  return { state, start, push, finishAfterApply, revert }
}
