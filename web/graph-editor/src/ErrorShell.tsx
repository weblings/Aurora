import { useEffect, useLayoutEffect, useRef, useState, type AnimationEventHandler } from 'react'
import { arrivalAnnouncement, arrivedKeys, baselineSnapshot, clockText, collapsibleKeys, errorSentence, layoutRows, lightTesterSentence, markErrors, orderRows, pairingAccessText, permissionRowHtml, reconcileSnapshot } from '../../ui/shellRows.js'
import { createShellCap } from '../../ui/shellCap.js'
import { renderLocalNetworkBanner } from '../../ui/MacPermissionRecovery.js'
import type { HostCondition, HostError } from './graph/hostState'
import type { Holder } from './graph/lightTest'
import type { PairingRequest } from './useHostState'

// The Dashboard's error shell as a React component (Aurora-s1t7.9): the markup and classes of
// web/ui/shell.js and styles/shell.css, so the two pages read as one. It fetches nothing: rows
// come in as props (the editor feeds it from GET /api/state and its own draft state), and the
// buttons call back. ErrorShell.test.tsx holds its markup equal to shell.js's. The rows, their order,
// keys and words come from web/ui/shellRows.js, the same model the Dashboard draws (Aurora-9hqa.1);
// each React row is keyed by its row key, so a changed message remounts only that row.

export type ShellLightTest = { holder: Holder | null; endsAtMs: number | null }

export type ShellBannerProps = {
  hostState: string | null
  // From GET /api/capabilities; a Mac permission row words itself by it.
  platform: string
  conditions: HostCondition[]
  errors: HostError[]
  // Rows the page supplies itself, plain text, no Retry and no dismiss.
  notes?: string[]
  // Another session's running light test, or null.
  lightTest: ShellLightTest | null
  // Pending LAN pairing requests, from GET /api/pairing/pending while this browser can approve them.
  pairings?: PairingRequest[]
  onDecidePairing?: (ref: string, decision: 'approve' | 'deny') => void
  // The row keys the user collapsed over, or null for open (shellRows.js isCollapsed).
  snapshot: string[] | null
  onSnapshotChange: (snapshot: string[] | null) => void
  onRetry: (source: string) => void
  onDismiss: (error: HostError) => void
  onStopTest: () => void
  // Arrival pulse (Aurora-9hqa.2): the keys of rows that are mid-pulse (data-new) and the call that
  // ends one on animationend. The shell works out arrivals; with neither given, no row pulses.
  pulsing?: string[]
  onPulseEnd?: (key: string) => void
}

// What a row's root element gets for its pulse; data-new is state, not part of the markup parity.
type Pulse = { 'data-new'?: string; onAnimationEnd: AnimationEventHandler<HTMLDivElement> }

// Ticks only its own text, once a second, like shell.js's timer.
function Clock({ endsAtMs }: { endsAtMs: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <span id="shell-light-test-time">{clockText(endsAtMs)}</span>
}

function Warning({ text }: { text: string }) {
  return (
    <p className="status-text status-text-error">
      <span className="shell-mark shell-mark-error" aria-hidden="true"></span> {text}
    </p>
  )
}

type Row = ReturnType<typeof orderRows>[number] & { count?: number }

function ConditionRow({ rowKey, condition, pulse }: { rowKey: string; condition: HostCondition; pulse: Pulse }) {
  // local_network is the one known condition row (shellRows.js renderRow); any other shows its message.
  const content =
    condition.source === 'local_network' ? (
      <div className="shell-banner-content" dangerouslySetInnerHTML={{ __html: markErrors(renderLocalNetworkBanner()) }} />
    ) : (
      <div className="shell-banner-content">
        <Warning text={condition.message ?? ''} />
      </div>
    )
  return (
    <div className="shell-banner-row" data-key={rowKey} {...pulse}>
      {content}
    </div>
  )
}

function ErrorRow({ rowKey, error, props, pulse }: { rowKey: string; error: HostError; props: ShellBannerProps; pulse: Pulse }) {
  const { hostState, platform, onRetry, onDismiss } = props
  const retryId = `shell-banner-retry-${error.source}`
  // X only while the old setup still works: a paused or failed host's row is the reason there are no lights.
  const dismiss =
    hostState === 'running' && Number.isInteger(error.id) ? (
      <button type="button" className="shell-banner-dismiss" id={`shell-banner-dismiss-${error.source}`} data-action="dismiss" data-key={rowKey} aria-label="Dismiss" onClick={() => onDismiss(error)}>
        ×
      </button>
    ) : null
  // The permission rows are shared with the Dashboard as HTML strings; their Retry is found by id.
  const html = permissionRowHtml(error, platform, rowKey)
  return (
    <div className="shell-banner-row" data-key={rowKey} {...pulse}>
      {html !== null ? (
        <div
          className="shell-banner-content"
          dangerouslySetInnerHTML={{ __html: html }}
          onClick={(e) => {
            if ((e.target as Element).closest('button')?.id === retryId) onRetry(error.source)
          }}
        />
      ) : (
        <div className="shell-banner-content">
          <Warning text={errorSentence(error, hostState)} />
          {error.retry === false ? null : (
            <button type="button" className="btn btn-secondary" id={retryId} data-action="retry" data-key={rowKey} style={{ marginTop: 'var(--aurora-space-3)' }} onClick={() => onRetry(error.source)}>
              Retry
            </button>
          )}
        </div>
      )}
      {dismiss}
    </div>
  )
}

function LightTestRow({ rowKey, lightTest, onStopTest, pulse }: { rowKey: string; lightTest: ShellLightTest; onStopTest: () => void; pulse: Pulse }) {
  return (
    <div className="shell-banner-row" data-key={rowKey} {...pulse}>
      <div className="shell-banner-content">
        <p className="status-text shell-pairing-title">
          <span className="shell-mark shell-mark-info" aria-hidden="true"></span> {lightTesterSentence(lightTest.holder)}
          {lightTest.endsAtMs === null ? null : (
            <>
              {' Will revert in: '}
              <Clock endsAtMs={lightTest.endsAtMs} />
            </>
          )}
        </p>
        <div className="shell-banner-actions">
          <button type="button" className="btn btn-secondary" id="shell-light-test-stop" data-action="stop-test" data-key={rowKey} onClick={onStopTest}>
            Stop test
          </button>
        </div>
      </div>
    </div>
  )
}

function PairingRowView({ rowKey, request, onDecide, pulse }: { rowKey: string; request: PairingRequest; onDecide: (ref: string, decision: 'approve' | 'deny') => void; pulse: Pulse }) {
  const access = pairingAccessText(request.scope ?? '')
  return (
    <div className="shell-banner-row" data-key={rowKey} {...pulse}>
      <div className="shell-banner-content">
        <p className="status-text shell-pairing-title">
          <span className="shell-mark shell-mark-info" aria-hidden="true"></span> Pair a device with Aurora?
        </p>
        <ul className="shell-pairing-details">
          <li>
            <span className="shell-pairing-label">Device:</span> {request.name ?? ''}
          </li>
          {request.from ? (
            <li>
              <span className="shell-pairing-label">From:</span> {request.from}
            </li>
          ) : null}
          {access ? (
            <li>
              <span className="shell-pairing-label">Access:</span> {access}
            </li>
          ) : null}
          <li>
            <span className="shell-pairing-label">Code:</span> <strong className="shell-pairing-code">{request.code ?? ''}</strong>. Approve only if the device shows the same code.
          </li>
        </ul>
        <div className="shell-banner-actions">
          <button type="button" className="btn btn-primary" id={`shell-pairing-approve-${request.ref}`} data-action="approve" data-key={rowKey} onClick={() => onDecide(request.ref, 'approve')}>
            Approve
          </button>
          <button type="button" className="btn btn-secondary" id={`shell-pairing-deny-${request.ref}`} data-action="deny" data-key={rowKey} onClick={() => onDecide(request.ref, 'deny')}>
            Deny
          </button>
        </div>
      </div>
    </div>
  )
}

// The rows, or nothing when there is nothing to say. Order, keys and the collapse (one toggle button for
// the whole shell, collapsed while the keys match the stored snapshot) are shellRows.js's.
export function ShellBanner(props: ShellBannerProps) {
  const { conditions, errors, notes = [], lightTest, pairings = [], snapshot, onSnapshotChange, pulsing = [], onPulseEnd } = props
  const pulse = (key: string): Pulse => ({
    'data-new': pulsing.includes(key) ? '' : undefined,
    onAnimationEnd: (e) => {
      if (e.target === e.currentTarget) onPulseEnd?.(key)
    },
  })
  const ordered = orderRows({ conditions, errors, notes, lightTest, pairings })
  const rows: Row[] = layoutRows(ordered, snapshot)
  if (rows.length === 0) return null
  const drawRow = (row: Row) => {
    switch (row.kind) {
      case 'light-test':
        return <LightTestRow key={row.key} rowKey={row.key} lightTest={lightTest as ShellLightTest} onStopTest={props.onStopTest} pulse={pulse(row.key)} />
      case 'pairing':
        return <PairingRowView key={row.key} rowKey={row.key} request={row.request as PairingRequest} onDecide={props.onDecidePairing ?? (() => {})} pulse={pulse(row.key)} />
      case 'condition':
        return <ConditionRow key={row.key} rowKey={row.key} condition={row.condition as HostCondition} pulse={pulse(row.key)} />
      case 'error':
        return <ErrorRow key={row.key} rowKey={row.key} error={row.error as HostError} props={props} pulse={pulse(row.key)} />
      case 'note':
        return (
          <div className="shell-banner-row" key={row.key} data-key={row.key} {...pulse(row.key)}>
            <div className="shell-banner-content">
              <Warning text={row.text as string} />
            </div>
          </div>
        )
      case 'toggle': {
        // The same button in both states: React keeps the node, so focus survives a toggle.
        const notices = row.notices as number
        const errorCount = row.errors as number
        const onClick = () => onSnapshotChange(row.collapsed ? null : collapsibleKeys(ordered))
        if (!row.collapsed) {
          return (
            <button type="button" className="shell-banner-summary shell-banner-collapse shell-banner-quiet" id="shell-banner-toggle" aria-expanded="true" data-action="toggle" data-key={row.key} key={row.key} onClick={onClick}>
              Show less <span className="accordion-chevron shell-banner-chevron-up" aria-hidden="true"></span>
            </button>
          )
        }
        return (
          <button type="button" className="shell-banner-summary" id="shell-banner-toggle" aria-expanded="false" data-action="toggle" data-key={row.key} key={row.key} onClick={onClick}>
            {notices > 0 ? (
              <span className="shell-count">
                <span className="shell-mark shell-mark-info" aria-hidden="true"></span> {`${notices} ${notices === 1 ? 'notice' : 'notices'}`}
              </span>
            ) : null}
            {errorCount > 0 ? (
              <span className="shell-count shell-count-error">
                <span className="shell-mark shell-mark-error" aria-hidden="true"></span> {`${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`}
              </span>
            ) : null}{' '}
            <span className="accordion-chevron" aria-hidden="true"></span>
          </button>
        )
      }
      default:
        return null
    }
  }
  return (
    <div className="shell-banner">
      <div className="shell-banner-inner">
        <div className="shell-banner-rows">{rows.filter((row) => row.kind !== 'toggle').map(drawRow)}</div>
        {rows.filter((row) => row.kind === 'toggle').map(drawRow)}
      </div>
    </div>
  )
}

export type ErrorShellProps = Omit<ShellBannerProps, 'snapshot' | 'onSnapshotChange' | 'pulsing' | 'onPulseEnd'> & {
  // The page's one polite live region (useAnnouncer): the sentences of rows that arrive, one call per render.
  onAnnounce?: (text: string) => void
  // Aurora cannot be reached: the full-screen takeover replaces every row.
  unreachable: boolean
  // False until the first GET /api/state reply, the canApprove answer and the first pending-pairing
  // result are in, and again while the takeover is up (useHostState). The shell draws nothing before
  // it; this turning true (the first time, and the first after the takeover) sets the baseline.
  hasReplied: boolean
}

// The first element of the page (#shell-banner-slot, sticky at the top, full width), then the
// takeover (#shell-overlay-slot). The collapse snapshot is seeded when hasReplied turns true (two or
// more rows start collapsed, a lone row open), dropped once the rows no longer match it, and never stored.
export function ErrorShell({ unreachable, hasReplied, onAnnounce, ...props }: ErrorShellProps) {
  const [snapshot, setSnapshot] = useState<string[] | null>(null)
  const [seeded, setSeeded] = useState(false)
  // Arrivals (Aurora-9hqa.2): every key the last render held (null before the baseline), the keys
  // mid-pulse, and the words to say for the latest arrival.
  const [known, setKnown] = useState<string[] | null>(null)
  const [pulsing, setPulsing] = useState<string[]>([])
  const [spoken, setSpoken] = useState<{ text: string } | null>(null)
  const rows = orderRows({ conditions: props.conditions, errors: props.errors, notes: props.notes ?? [], lightTest: props.lightTest, pairings: props.pairings ?? [] })
  // Adjusting state during render, the way React documents for state derived from props.
  if (hasReplied !== seeded) {
    setSeeded(hasReplied)
    setSnapshot(hasReplied ? baselineSnapshot(rows) : null)
    // What is there at the baseline (the first ready render, and the first after the takeover) is not an arrival.
    setKnown(hasReplied ? rows.map((row) => row.key) : null)
    setPulsing([])
  } else if (hasReplied) {
    const kept = reconcileSnapshot(rows, snapshot)
    if (kept !== snapshot) setSnapshot(kept)
    // A new key both opens the shell (reconcileSnapshot above) and starts its pulse, in this one render;
    // rows that were already there, folded or not, do not pulse.
    const keys = rows.map((row) => row.key)
    const fresh = arrivedKeys(rows, known)
    if (fresh.length > 0) {
      setPulsing((current) => [...current, ...fresh])
      setSpoken({ text: arrivalAnnouncement(rows, fresh, { hostState: props.hostState, platform: props.platform }) })
    }
    if (known !== null && (keys.length !== known.length || keys.some((key) => !known.includes(key)))) setKnown(keys)
  }
  useEffect(() => {
    if (spoken?.text) onAnnounce?.(spoken.text)
  }, [spoken, onAnnounce])
  // The 60vh cap on the rows region (Aurora-9hqa.3, ui/shellCap.js): after each commit it keeps the
  // region's focus and fades true, scrolls to a new row, and starts each pulse once the row is seen.
  // animationend ends a pulse; the cap's fallback timer (started when the pulse starts) covers an
  // animation that never runs (a hidden tab).
  const slotRef = useRef<HTMLDivElement>(null)
  const capRef = useRef<ReturnType<typeof createShellCap> | null>(null)
  useLayoutEffect(() => {
    const cap = createShellCap({ onPulseDone: (node: Element) => setPulsing((current) => current.filter((k) => k !== node.getAttribute('data-key'))) })
    capRef.current = cap
    return () => {
      cap.dispose()
      capRef.current = null
    }
  }, [])
  useLayoutEffect(() => {
    capRef.current?.render(slotRef.current)
  })
  const show = hasReplied && seeded && !unreachable
  return (
    <>
      <div id="shell-banner-slot" ref={slotRef}>{show ? <ShellBanner {...props} snapshot={snapshot} onSnapshotChange={setSnapshot} pulsing={pulsing} onPulseEnd={(key) => setPulsing((current) => current.filter((k) => k !== key))} /> : null}</div>
      <div id="shell-overlay-slot">
        {unreachable ? (
          <div className="overlay">
            <div className="overlay-scrim"></div>
            <div className="overlay-panel">
              <h2>Aurora has stopped</h2>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
