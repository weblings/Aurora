import { useCallback, useEffect, useRef, useState } from 'react'
import { canManagePairing, fetchPairingStatus } from '../../ui/Pairing.js'
import { baselineReady } from '../../ui/shellRows.js'
import { emptyHost, parseHostState, reachAfter, reachable, type HostError, type HostSnapshot, type Reach } from './graph/hostState'

// The Dashboard's cadence and limits (web/ui/shell.js).
export const POLL_MS = 3000
const ABORT_MS = 2500

// A pending LAN pairing request (GET /api/pairing/pending).
export type PairingRequest = { ref: string; name?: string; scope?: string; code?: string; from?: string }

export type HostStateApi = {
  host: HostSnapshot
  // False until the shell can take its collapse baseline, and again once the takeover is up: the shell
  // draws nothing without it. That is the first /api/state reply, the canApprove answer from
  // /api/pairing/status and, when this browser can approve, the first pending-pairing result
  // (Aurora-9hqa.4), so requests already pending at load read as baseline, not as arrivals.
  hasReplied: boolean
  // Pending pairing requests; always empty unless this browser can approve (loopback or a paired admin).
  pairings: PairingRequest[]
  // Approve or deny a request, then re-read the list (shell.js _decidePairing).
  decidePairing: (ref: string, decision: 'approve' | 'deny') => Promise<void>
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

// GET /api/pairing/status: true on loopback or a paired admin, the Dashboard's own rule (app.js).
// A failed read is false, as on the Dashboard.
async function fetchCanApprove(): Promise<boolean> {
  return canManagePairing(await fetchPairingStatus())
}

// Reads GET /api/state at once and then every POLL_MS, single-flight, like shell.js's beat.
export function useHostState(): HostStateApi {
  const [host, setHost] = useState<HostSnapshot>(emptyHost)
  const [hasReplied, setHasReplied] = useState(false)
  const [reach, setReach] = useState<Reach>(reachable)
  const [recoveries, setRecoveries] = useState(0)
  const [canApprove, setCanApprove] = useState<boolean | null>(null)
  const [pairings, setPairings] = useState<PairingRequest[]>([])
  const [pendingLoaded, setPendingLoaded] = useState(false)
  const canApproveRef = useRef<boolean | null>(null)
  const pairingFlight = useRef<Promise<void> | null>(null)
  const [testEndsAtMs, setTestEndsAtMs] = useState<number | null>(null)
  const reachRef = useRef<Reach>(reachable)
  const flight = useRef<Promise<boolean> | null>(null)

  // The status read (once; again after Aurora comes back) and the pending list with the beat, single-flight
  // like the poll. A failed pending read keeps the last list but still counts as the first result, so a
  // broken route cannot hold the shell back.
  const refreshPairing = useCallback((): Promise<void> => {
    if (pairingFlight.current) return pairingFlight.current
    const run = (async () => {
      try {
        if (canApproveRef.current === null) {
          canApproveRef.current = await fetchCanApprove()
          setCanApprove(canApproveRef.current)
        }
        if (!canApproveRef.current) return
        try {
          const body = await (await fetch('/api/pairing/pending')).json()
          setPairings(Array.isArray(body?.pending) ? body.pending : [])
        } catch {
          // Keep the last list; the next beat tries again.
        }
        setPendingLoaded(true)
      } finally {
        pairingFlight.current = null
      }
    })()
    pairingFlight.current = run
    return run
  }, [])

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
        void refreshPairing()
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
          setPairings([])
          setPendingLoaded(false)
          // Read the status again once Aurora is back (the paired admin may have changed).
          canApproveRef.current = null
          setCanApprove(null)
        }
        return false
      } finally {
        window.clearTimeout(timer)
        flight.current = null
      }
    })()
    flight.current = run
    return run
  }, [refreshPairing])

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

  // No optimistic removal: the re-read shows what Aurora holds (an expired request just goes).
  const decidePairing = useCallback(
    async (ref: string, decision: 'approve' | 'deny') => {
      try {
        await fetch(`/api/pairing/pending/${encodeURIComponent(ref)}/${decision}`, { method: 'POST' })
      } catch {
        // Unreachable is the takeover's.
      }
      // A read already out predates the POST: let it finish, then read again.
      await pairingFlight.current
      await refreshPairing()
    },
    [refreshPairing],
  )

  const shellReady = hasReplied && baselineReady({ stateReplied: hasReplied, canApprove, pendingLoaded })
  return { host, hasReplied: shellReady, pairings, decidePairing, reachable: !reach.down, testEndsAtMs, recoveries, checkNow: poll, dismiss, retry, stopTest }
}
