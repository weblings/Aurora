import { useEffect, useState } from 'react'
import { friendlyReloadError } from '../../ui/messages.js'
import { parseMacPermissionError, renderAudioPermissionBanner, renderLocalNetworkBanner, renderReloadError } from '../../ui/MacPermissionRecovery.js'
import { testerName } from '../../ui/testHolder.js'
import type { HostCondition, HostError } from './graph/hostState'
import type { Holder } from './graph/lightTest'

// The Dashboard's error shell as a React component (Aurora-s1t7.9): the markup and classes of
// web/ui/shell.js and styles/shell.css, so the two pages read as one. It fetches nothing: rows
// come in as props (the editor feeds it from GET /api/state and its own draft state), and the
// buttons call back. ErrorShell.test.tsx holds its markup equal to shell.js's.

// Row prefix per error source, so the raw server reason reads as a sentence (shell.js SOURCE_PREFIX).
const SOURCE_PREFIX: Record<string, string> = {
  startup: "Couldn't start: ",
  resume: "Couldn't resume: ",
  reload: "Couldn't apply settings: ",
  effect: '',
}

// The row's sentence (shell.js _renderBannerRow). A reload error on a running host means the old
// setup still drives the lights.
export function errorText(error: HostError, hostState: string | null): string {
  const message = friendlyReloadError(error.message)
  return hostState === 'running' && error.source === 'reload'
    ? `Saved, but couldn't apply: ${message}. Aurora is still running your previous setup and will try the new one next time it starts.`
    : (SOURCE_PREFIX[error.source] ?? '') + message
}

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

function clock(endsAtMs: number): string {
  const seconds = Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// Ticks only its own text, once a second, like shell.js's timer.
function Clock({ endsAtMs }: { endsAtMs: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <span id="shell-light-test-time">{clock(endsAtMs)}</span>
}

function Warning({ text }: { text: string }) {
  return (
    <p className="status-text status-text-error">
      <span className="warn-glyph" aria-hidden="true"></span> {text}
    </p>
  )
}

function ConditionRow({ condition }: { condition: HostCondition }) {
  // local_network is the one known condition row (shell.js CONDITION_ROWS); any other shows its message.
  const content =
    condition.source === 'local_network' ? (
      <div className="shell-banner-content" dangerouslySetInnerHTML={{ __html: renderLocalNetworkBanner() }} />
    ) : (
      <div className="shell-banner-content">
        <Warning text={condition.message ?? ''} />
      </div>
    )
  return <div className="shell-banner-row">{content}</div>
}

function ErrorRow({ error, props }: { error: HostError; props: ShellBannerProps }) {
  const { hostState, platform, onRetry, onDismiss } = props
  const retryId = `shell-banner-retry-${error.source}`
  const parsed = platform === 'mac' ? parseMacPermissionError(error.message) : null
  // X only while the old setup still works: a paused or failed host's row is the reason there are no lights.
  const dismiss =
    hostState === 'running' && Number.isInteger(error.id) ? (
      <button type="button" className="shell-banner-dismiss" id={`shell-banner-dismiss-${error.source}`} aria-label="Dismiss" onClick={() => onDismiss(error)}>
        ×
      </button>
    ) : null
  // The permission rows are shared with the Dashboard as HTML strings; their Retry is found by id.
  const html = error.source === 'audio_permission' ? renderAudioPermissionBanner({ retryId }) : parsed ? renderReloadError(error.message, platform, { retryId }) : null
  return (
    <div className="shell-banner-row">
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
          <Warning text={errorText(error, hostState)} />
          {error.retry === false ? null : (
            <button type="button" className="btn btn-secondary" id={retryId} style={{ marginTop: 'var(--aurora-space-3)' }} onClick={() => onRetry(error.source)}>
              Retry
            </button>
          )}
        </div>
      )}
      {dismiss}
    </div>
  )
}

function LightTestRow({ lightTest, onStopTest }: { lightTest: ShellLightTest; onStopTest: () => void }) {
  const who = testerName(lightTest.holder)
  return (
    <div className="shell-banner-row">
      <div className="shell-banner-content">
        <p className="status-text shell-pairing-title">
          {`${who[0].toUpperCase()}${who.slice(1)} is testing an effect on the lights.`}
          {lightTest.endsAtMs === null ? null : (
            <>
              {' Will revert in: '}
              <Clock endsAtMs={lightTest.endsAtMs} />
            </>
          )}
        </p>
        <div className="shell-banner-actions">
          <button type="button" className="btn btn-secondary" id="shell-light-test-stop" onClick={onStopTest}>
            Stop test
          </button>
        </div>
      </div>
    </div>
  )
}

// The rows, or nothing when there is nothing to say. Two or more problems collapse to a summary
// line the user expands; a single one always shows in full (shell.js _renderBanner).
export function ShellBanner(props: ShellBannerProps) {
  const { conditions, errors, notes = [], lightTest, expanded, onExpandedChange } = props
  const rowCount = conditions.length + errors.length + notes.length
  if (rowCount === 0 && !lightTest) return null
  const collapsible = rowCount > 1
  const collapsed = collapsible && !expanded
  return (
    <div className="shell-banner">
      <div className="shell-banner-inner">
        {lightTest ? <LightTestRow lightTest={lightTest} onStopTest={props.onStopTest} /> : null}
        {rowCount === 0 ? null : collapsed ? (
          <button type="button" className="shell-banner-summary" id="shell-banner-expand" onClick={() => onExpandedChange(true)}>
            <span className="warn-glyph" aria-hidden="true"></span> {`${rowCount} problems`} <span className="accordion-chevron" aria-hidden="true"></span>
          </button>
        ) : (
          <>
            {conditions.map((c) => (
              <ConditionRow key={`c-${c.source}`} condition={c} />
            ))}
            {errors.map((e) => (
              <ErrorRow key={`e-${e.source}`} error={e} props={props} />
            ))}
            {notes.map((text) => (
              <div className="shell-banner-row" key={`n-${text}`}>
                <div className="shell-banner-content">
                  <Warning text={text} />
                </div>
              </div>
            ))}
            {collapsible ? (
              <button type="button" className="shell-banner-summary shell-banner-collapse" id="shell-banner-collapse" onClick={() => onExpandedChange(false)}>
                Show less <span className="accordion-chevron shell-banner-chevron-up" aria-hidden="true"></span>
              </button>
            ) : null}
          </>
        )}
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
