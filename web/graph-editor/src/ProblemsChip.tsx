import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { Dialog, Icon, warningIcon } from '@weblings/grille'
import { EditorPopup } from './EditorPopup'
import { COMPACT_BAR, useMedia } from './useMedia'
import type { Problems } from './graph/problems'

export function problemCount(problems: Problems): number {
  let n = problems.graph.length
  for (const p of problems.nodes.values()) n += p.messages.length
  return n
}

// A write refused for problems (Aurora-u68h.4): the callout's words, and a new `id` for each refusal
// so the same words twice still show twice.
export type Refusal = { id: number; text: string }

// The callout lasts CALLOUT_MS; after PING_BEAT_MS the chip alone pings, two pulses that end as the
// callout closes (owner, 2026-11-12; the Grille mock's REFUSED_TIP_MS and PING_BEAT_MS).
export const CALLOUT_MS = 4200
export const PING_BEAT_MS = 1450

// The one place the graph's problems are counted: node-level and graph-wide.
// A node row selects the node; a "Whole graph" row has no node to point at, so
// it carries its own action. A refused Save points here: focus, a callout on the
// chip's left, then a ping.
export function ProblemsChip({
  problems,
  chipRef,
  refusal,
  focusAfter,
  onSelectNode,
  onAddNode,
}: {
  problems: Problems
  chipRef: RefObject<HTMLButtonElement | null>
  refusal: Refusal | null
  focusAfter: MutableRefObject<(() => HTMLElement | null) | null>
  onSelectNode: (id: string) => void
  onAddNode: () => void
}) {
  const [open, setOpen] = useState(false)
  const compact = useMedia(COMPACT_BAR)
  const count = problemCount(problems)
  const [callout, setCallout] = useState<string | null>(null)
  const [pinging, setPinging] = useState(false)
  const refusalId = refusal?.id
  const refusalText = refusal?.text
  useEffect(() => {
    if (refusalId === undefined) return
    chipRef.current?.focus({ preventScroll: true })
    setCallout(refusalText ?? null)
    setPinging(false)
    const ping = window.setTimeout(() => setPinging(true), PING_BEAT_MS)
    const end = window.setTimeout(() => {
      setCallout(null)
      setPinging(false)
    }, CALLOUT_MS)
    return () => {
      window.clearTimeout(ping)
      window.clearTimeout(end)
    }
  }, [refusalId, refusalText, chipRef])
  // Escape closes the callout early (it is hover-less help, so it must be dismissable).
  useEffect(() => {
    if (callout === null) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCallout(null)
        setPinging(false)
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [callout])
  // Enter or a click on the chip lands on the first row, not the dialog.
  const firstRow = useCallback((list: HTMLUListElement | null) => {
    list?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
  }, [])
  if (count === 0) return null
  const close = () => setOpen(false)
  return (
    <>
      <span className="editor-chip-wrap">
        <button
          ref={chipRef}
          type="button"
          className="ui-button editor-problems-chip"
          data-size="sm"
          data-pinging={pinging ? 'true' : undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={compact ? `${count} ${count === 1 ? 'problem' : 'problems'}` : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon icon={warningIcon} size="sm" />
          {compact ? count : `${count} ${count === 1 ? 'problem' : 'problems'}`}
        </button>
        {/* Always mounted, so a screen reader hears the text when it appears. */}
        <span role="status" className="editor-refused-status">
          {callout !== null ? <span className="ui-tooltip editor-refused" data-refused="">{callout}</span> : null}
        </span>
      </span>
      <EditorPopup isOpen={open} onClose={close} label="Problems" triggerRef={chipRef} focusAfter={focusAfter}>
        <Dialog aria-label="Problems">
          <ul className="editor-problem-list" ref={firstRow}>
            {[...problems.nodes].flatMap(([id, p]) =>
              p.messages.map((m) => (
                <li key={`${id}:${m}`}>
                  <button
                    type="button"
                    className="editor-problem-row editor-problem-text"
                    onClick={() => {
                      close()
                      onSelectNode(id)
                    }}
                  >
                    <strong>{id}</strong>
                    <span>{m}</span>
                  </button>
                </li>
              )),
            )}
            {problems.graph.map((m) => (
              <li key={`graph:${m}`} className="editor-problem-row">
                <span className="editor-problem-text">
                  <strong>Whole graph</strong>
                  <span>{m}</span>
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    close()
                    onAddNode()
                  }}
                >
                  Add node…
                </button>
              </li>
            ))}
          </ul>
        </Dialog>
      </EditorPopup>
    </>
  )
}
