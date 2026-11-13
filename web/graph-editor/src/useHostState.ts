import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyHost, parseHostState, reachAfter, reachable, type HostError, type HostSnapshot, type Reach } from './graph/hostState'

// The Dashboard's cadence and limits (web/ui/shell.js).
export const POLL_MS = 3000
const ABORT_MS = 2500

export type HostStateApi = {
  host: HostSnapshot
  // False until the first /api/state reply, and again once the takeover is up: the error shell draws
  // nothing without it, and its collapse baseline is taken when it turns true.
  hasReplied: boolean
  // The one verdict on whether Aurora can be reached: the shell's takeover and the Test
  // button both read it. False only after two failed polls in a row.
  reachable: boolean
  // When the running Once test lapses (ms epoch), from the last answer; null for a Live one or none.
  testEndsAtMs: number | null
  // Counts times Aurora came back after being gone, so a page that could not load can retry.
  recoveries: number
  // Looks now (a failed request elsewhere is the earliest hint Aurora is gone). Resolves
  // true when Aurora answered; concurrent calls share one request.
  checkNow: () => Promise<boolean>
  dismiss: (error: HostError) => Promise<void>
  retry: (source: string) => Promise<void>
  stopTest: () => Promise<void>
}

async function fetchState(signal: AbortSignal): Promise<unknown> {
  const response = await fetch('/api/state', { signal })
  // An HTTP answer of any status means Aurora is up, even without a JSON body.
  return response.json().catch(() => null)
}

// Reads GET /api/state at once and then every POLL_MS, single-flight, like shell.js's beat.
export function useHostState(): HostStateApi {
  const [host, setHost] = useState<HostSnapshot>(emptyHost)
  const [hasReplied, setHasReplied] = useState(false)
  const [reach, setReach] = useState<Reach>(reachable)
  const [recoveries, setRecoveries] = useState(0)
  const [testEndsAtMs, setTestEndsAtMs] = useState<number | null>(null)
  const reachRef = useRef<Reach>(reachable)
  const flight = useRef<Promise<boolean> | null>(null)

  const poll = useCallback((): Promise<boolean> => {
    if (flight.current) return flight.current
    const run = (async () => {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), ABORT_MS)
      try {
        const snapshot = parseHostState(await fetchState(controller.signal))
        const wasDown = reachRef.current.down
        reachRef.current = reachAfter(reachRef.current, true)
        setReach(reachRef.current)
        setHost(snapshot)
        setHasReplied(true)
        setTestEndsAtMs(snapshot.test.remainingMs === null ? null : Date.now() + snapshot.test.remainingMs)
        if (wasDown) setRecoveries((n) => n + 1)
        return true
      } catch {
        const before = reachRef.current
        reachRef.current = reachAfter(before, false)
        setReach(reachRef.current)
        // The takeover replaces every row: they are stale the moment Aurora is gone.
        if (reachRef.current.down) {
          setHost(emptyHost)
          setHasReplied(false)
        }
        return false
      } finally {
        window.clearTimeout(timer)
        flight.current = null
      }
    })()
    flight.current = run
    return run
  }, [])

  useEffect(() => {
    let timer: number | undefined
    let stopped = false
    const beat = async () => {
      await poll()
      if (!stopped) timer = window.setTimeout(beat, POLL_MS)
    }
    void beat()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [poll])

  // The server owns the dismissal; no optimistic clearing: the re-read shows what it holds.
  const dismiss = useCallback(
    async (error: HostError) => {
      try {
        await fetch('/api/state/dismiss', { method: 'POST', body: JSON.stringify({ source: error.source, id: error.id }) })
      } catch {
        // Unreachable is the takeover's.
      }
      await poll()
    },
    [poll],
  )

  // A failed resume sends the resume again, anything else rebuilds (shell.js _retry).
  const retry = useCallback(
    async (source: string) => {
      const [url, init]: [string, RequestInit] = source === 'resume' ? ['/api/state', { method: 'PUT', body: JSON.stringify({ running: true }) }] : ['/api/reload', { method: 'POST' }]
      try {
        await fetch(url, init)
      } catch {
        // As above.
      }
      await poll()
    },
    [poll],
  )

  const stopTest = useCallback(async () => {
    try {
      await fetch('/api/graph/test/stop', { method: 'POST' })
    } catch {
      // As above.
    }
    await poll()
  }, [poll])

  return { host, hasReplied, reachable: !reach.down, testEndsAtMs, recoveries, checkNow: poll, dismiss, retry, stopTest }
}
