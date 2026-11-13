import { useEffect, useState } from 'react'
import { clockText, collapsedLabel, errorSentence, layoutRows, lightTesterSentence, orderRows, permissionRowHtml } from '../../ui/shellRows.js'
import { renderLocalNetworkBanner } from '../../ui/MacPermissionRecovery.js'
import type { HostCondition, HostError } from './graph/hostState'
import type { Holder } from './graph/lightTest'

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
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onRetry: (source: string) => void
  onDismiss: (error: HostError) => void
  onStopTest: () => void
}

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
      <span className="warn-glyph" aria-hidden="true"></span> {text}
    </p>
  )
}

type Row = ReturnType<typeof orderRows>[number] & { count?: number }

function ConditionRow({ rowKey, condition }: { rowKey: string; condition: HostCondition }) {
  // local_network is the one known condition row (shellRows.js renderRow); any other shows its message.
  const content =
    condition.source === 'local_network' ? (
      <div className="shell-banner-content" dangerouslySetInnerHTML={{ __html: renderLocalNetworkBanner() }} />
    ) : (
      <div className="shell-banner-content">
        <Warning text={condition.message ?? ''} />
      </div>
    )
  return (
    <div className="shell-banner-row" data-key={rowKey}>
      {content}
    </div>
  )
}

function ErrorRow({ rowKey, error, props }: { rowKey: string; error: HostError; props: ShellBannerProps }) {
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
    <div className="shell-banner-row" data-key={rowKey}>
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

function LightTestRow({ rowKey, lightTest, onStopTest }: { rowKey: string; lightTest: ShellLightTest; onStopTest: () => void }) {
  return (
    <div className="shell-banner-row" data-key={rowKey}>
      <div className="shell-banner-content">
        <p className="status-text shell-pairing-title">
          {lightTesterSentence(lightTest.holder)}
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

// The rows, or nothing when there is nothing to say. Order, keys and the collapse rule (two or more
// problems fold to a summary line the user expands; one always shows in full) are shellRows.js's.
export function ShellBanner(props: ShellBannerProps) {
  const { conditions, errors, notes = [], lightTest, expanded, onExpandedChange } = props
  const rows: Row[] = layoutRows(orderRows({ conditions, errors, notes, lightTest }), expanded)
  if (rows.length === 0) return null
  return (
    <div className="shell-banner">
      <div className="shell-banner-inner">
        {rows.map((row) => {
          switch (row.kind) {
            case 'light-test':
              return <LightTestRow key={row.key} rowKey={row.key} lightTest={lightTest as ShellLightTest} onStopTest={props.onStopTest} />
            case 'condition':
              return <ConditionRow key={row.key} rowKey={row.key} condition={row.condition as HostCondition} />
            case 'error':
              return <ErrorRow key={row.key} rowKey={row.key} error={row.error as HostError} props={props} />
            case 'note':
              return (
                <div className="shell-banner-row" key={row.key} data-key={row.key}>
                  <div className="shell-banner-content">
                    <Warning text={row.text as string} />
                  </div>
                </div>
              )
            case 'summary':
              return (
                <button type="button" className="shell-banner-summary" id="shell-banner-expand" data-action="expand" data-key={row.key} key={row.key} onClick={() => onExpandedChange(true)}>
                  <span className="warn-glyph" aria-hidden="true"></span> {collapsedLabel(row.count as number)} <span className="accordion-chevron" aria-hidden="true"></span>
                </button>
              )
            case 'less':
              return (
                <button type="button" className="shell-banner-summary shell-banner-collapse" id="shell-banner-collapse" data-action="collapse" data-key={row.key} key={row.key} onClick={() => onExpandedChange(false)}>
                  Show less <span className="accordion-chevron shell-banner-chevron-up" aria-hidden="true"></span>
                </button>
              )
            default:
              return null
          }
        })}
      </div>
    </div>
  )
}

export type ErrorShellProps = Omit<ShellBannerProps, 'expanded' | 'onExpandedChange'> & {
  // Aurora cannot be reached: the full-screen takeover replaces every row.
  unreachable: boolean
}

// The first element of the page (#shell-banner-slot, sticky at the top, full width), then the
// takeover (#shell-overlay-slot). The expanded state falls back to collapsed once the rows go.
export function ErrorShell({ unreachable, ...props }: ErrorShellProps) {
  const [expanded, setExpanded] = useState(false)
  const rowCount = props.conditions.length + props.errors.length + (props.notes?.length ?? 0)
  useEffect(() => {
    if (rowCount === 0) setExpanded(false)
  }, [rowCount])
  return (
    <>
      <div id="shell-banner-slot">{unreachable ? null : <ShellBanner {...props} expanded={expanded} onExpandedChange={setExpanded} />}</div>
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
