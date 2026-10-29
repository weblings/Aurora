import { useCallback, useEffect, useReducer, useRef } from 'react'
import { fetchTestInfo, heartbeat, keepTest, revertTest, startTest, type CloseResult } from './api'
import { initialTest, testReducer, type TestState } from './graph/lightTest'
import type { DraftVerdict } from './api'

const IDLE_POLL_MS = 3000
const TICK_MS = 1000
// Heartbeats that failed in a row before the tab gives up on the test. The
// server reverts by itself after 6 s of silence, so this only changes the label.
const LOST_AFTER = 3

export type LightTest = {
  state: TestState
  // Sends the draft, then starts a test of it.
  start: () => Promise<void>
  // Makes the tested graph the live effect under `id`.
  keep: (id: string) => Promise<CloseResult>
  revert: () => Promise<void>
}

// Runs one test on the lights for this tab: heartbeats while it lasts, a
// countdown between them, and a slow look at the server while idle so a test
// someone else holds can be shown. `sendDraft` must leave the server's draft
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

  // While idle: who holds the lights, if anyone else.
  const idle = state.phase === 'idle'
  useEffect(() => {
    if (!idle) return
    let stopped = false
    const look = () => {
      if (document.hidden) return
      fetchTestInfo()
        .then(({ holder }) => !stopped && dispatch({ type: 'seen', holder: holder && holder.session !== session ? holder : null }))
        .catch(() => {})
    }
    look()
    const timer = window.setInterval(look, IDLE_POLL_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [idle, session])

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

  const start = useCallback(async () => {
    dispatch({ type: 'starting' })
    try {
      const verdict = await send.current()
      if (!verdict.valid) {
        dispatch({ type: 'start-failed', message: 'Fix the problems before testing' })
        return
      }
      const started = await startTest(session)
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

  const keep = useCallback(
    async (id: string): Promise<CloseResult> => {
      dispatch({ type: 'closing' })
      let result: CloseResult
      try {
        result = await keepTest(session, id)
      } catch (e) {
        result = { ok: false, reason: (e as Error).message, over: false }
      }
      if (result.ok) dispatch({ type: 'closed', kind: 'kept' })
      else if (result.over) dispatch({ type: 'ended', end: { reason: null, holder: null } })
      else dispatch({ type: 'close-failed', message: result.reason })
      return result
    },
    [session],
  )

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

  return { state, start, keep, revert }
}
