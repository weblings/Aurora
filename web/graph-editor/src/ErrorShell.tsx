import { useEffect, useLayoutEffect, useRef, useState, type AnimationEventHandler, type ReactNode } from 'react'
import { Button, MessageRow } from '@weblings_things/grille'
import { arrivalAnnouncement, arrivedKeys, baselineSnapshot, clockText, collapsibleKeys, errorSentence, layoutRows, lightTesterSentence, markErrors, orderRows, pairingAccessText, permissionRowHtml, reconcileSnapshot } from '../../ui/shellRows.js'
import { createShellCap } from '../../ui/shellCap.js'
import { renderLocalNetworkBanner } from '../../ui/MacPermissionRecovery.js'
import type { HostCondition, HostError } from './graph/hostState'
import type { Holder } from './graph/lightTest'
import type { PairingRequest } from './useHostState'

// The Dashboard's error shell as a React component (Aurora-s1t7.9). Its rows are Grille MessageRows
// (Aurora-4nqt.2) and the toggle, collapse and pulse keep shell.css. It fetches nothing: rows
// come in as props (the editor feeds it from GET /api/state and its own draft state), and the
// buttons call back. ErrorShell.test.tsx holds its words and actions equal to shell.js's. The rows, their order,
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

// The shared permission and local-network html carries its own circled mark; MessageRow draws the mark here.
const MARK_HTML = /<span class="shell-mark shell-mark-error" aria-hidden="true"><\/span>\s?/g
const sharedHtml = (html: string) => <div dangerouslySetInnerHTML={{ __html: html.replace(MARK_HTML, '') }} />

// The row box is Grille's MessageRow; the wrapper only carries the key, the pulse and the cap's hooks.
function RowBox({ rowKey, pulse, children }: { rowKey: string; pulse: Pulse; children: ReactNode }) {
  return (
    <div className="shell-banner-row shell-grille-row" data-key={rowKey} {...pulse}>
      {children}
    </div>
  )
}

type Row = ReturnType<typeof orderRows>[number] & { count?: number }

function ConditionRow({ rowKey, condition, pulse }: { rowKey: string; condition: HostCondition; pulse: Pulse }) {
  // local_network is the one known condition row (shellRows.js renderRow); any other shows its message.
  const message = condition.source === 'local_network' ? sharedHtml(markErrors(renderLocalNetworkBanner())) : (condition.message ?? '')
  return (
    <RowBox rowKey={rowKey} pulse={pulse}>
      <MessageRow tone="error" message={message} />
    </RowBox>
  )
}

function ErrorRow({ rowKey, error, props, pulse }: { rowKey: string; error: HostError; props: ShellBannerProps; pulse: Pulse }) {
  const { hostState, platform, onRetry, onDismiss } = props
  const retryId = `shell-banner-retry-${error.source}`
  // X only while the old setup still works: a paused or failed host's row is the reason there are no lights.
  const dismissible = hostState === 'running' && Number.isInteger(error.id)
  // The permission rows are shared with the Dashboard as HTML strings; their Retry is found by id.
  const html = permissionRowHtml(error, platform, rowKey)
  return (
    <RowBox rowKey={rowKey} pulse={pulse}>
      {html !== null ? (
        <div
          onClick={(e) => {
            if ((e.target as Element).closest('button')?.id === retryId) onRetry(error.source)
          }}
        >
          <MessageRow tone="error" message={sharedHtml(html)} onDismiss={dismissible ? () => onDismiss(error) : undefined} />
        </div>
      ) : (
        <MessageRow tone="error" message={errorSentence(error, hostState)} onDismiss={dismissible ? () => onDismiss(error) : undefined}>
          {error.retry === false ? null : (
            <Button variant="secondary" id={retryId} data-action="retry" data-key={rowKey} onPress={() => onRetry(error.source)}>
              Retry
            </Button>
          )}
        </MessageRow>
      )}
    </RowBox>
  )
}

function LightTestRow({ rowKey, lightTest, onStopTest, pulse }: { rowKey: string; lightTest: ShellLightTest; onStopTest: () => void; pulse: Pulse }) {
  const message = (
    <>
      {lightTesterSentence(lightTest.holder)}
      {lightTest.endsAtMs === null ? null : (
        <>
          {' Will revert in: '}
          <Clock endsAtMs={lightTest.endsAtMs} />
        </>
      )}
    </>
  )
  return (
    <RowBox rowKey={rowKey} pulse={pulse}>
      <MessageRow tone="notice" message={message}>
        <Button variant="secondary" id="shell-light-test-stop" data-action="stop-test" data-key={rowKey} onPress={onStopTest}>
          Stop test
        </Button>
      </MessageRow>
    </RowBox>
  )
}

function PairingRowView({ rowKey, request, onDecide, pulse }: { rowKey: string; request: PairingRequest; onDecide: (ref: string, decision: 'approve' | 'deny') => void; pulse: Pulse }) {
  const access = pairingAccessText(request.scope ?? '')
  return (
    <RowBox rowKey={rowKey} pulse={pulse}>
      <MessageRow tone="notice" message={<strong>Pair a device with Aurora?</strong>}>
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
          <Button variant="primary" id={`shell-pairing-approve-${request.ref}`} data-action="approve" data-key={rowKey} onPress={() => onDecide(request.ref, 'approve')}>
            Approve
          </Button>
          <Button variant="secondary" id={`shell-pairing-deny-${request.ref}`} data-action="deny" data-key={rowKey} onPress={() => onDecide(request.ref, 'deny')}>
            Deny
          </Button>
        </div>
      </MessageRow>
    </RowBox>
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
          <RowBox key={row.key} rowKey={row.key} pulse={pulse(row.key)}>
            <MessageRow tone="error" message={row.text as string} />
          </RowBox>
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
