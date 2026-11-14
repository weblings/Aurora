import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MutableRefObject, type RefObject } from 'react'
import { Button, Dialog, Icon, warningIcon } from '@weblings/grille'
import { EditorPopup } from './EditorPopup'
import { COMPACT_BAR, useMedia } from './useMedia'
import type { Problems } from './graph/problems'
import type { GraphRowAction } from './graph/problemActions'

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

// The callout keeps this far from each edge of the window, and sits this far from the chip (Aurora-h55g).
const GUTTER = 16
const CALLOUT_GAP = 10
// Below the chip, the box starts right of the canvas's Add node button when that leaves it at least this wide;
// otherwise it drops under the button (Aurora-u8jx.4.1).
const MIN_BELOW_WIDTH = 220

const LEFT = { side: 'left' as const, top: 0, left: 0, arrow: 0, detached: false }

// The one place the graph's problems are counted: node-level and graph-wide.
// A node row selects the node; a "Whole graph" row has no node to point at, so
// it carries an action only when one fits its code (graph/problemActions.ts). A refused Save points here: focus, a callout on the
// chip's left, then a ping.
export function ProblemsChip({
  problems,
  chipRef,
  refusal,
  focusAfter,
  onSelectNode,
  onGraphAction,
}: {
  problems: Problems
  chipRef: RefObject<HTMLButtonElement | null>
  refusal: Refusal | null
  focusAfter: MutableRefObject<(() => HTMLElement | null) | null>
  onSelectNode: (id: string) => void
  onGraphAction: (run: GraphRowAction['run']) => void
}) {
  const [open, setOpen] = useState(false)
  const compact = useMedia(COMPACT_BAR)
  const count = problemCount(problems)
  const [callout, setCallout] = useState<string | null>(null)
  const [pinging, setPinging] = useState(false)
  // Where the callout sits: on the chip's left when its one-line width fits between the chip and the
  // left gutter, else below the chip, wrapped, inside the gutters (Aurora-h55g).
  const [place, setPlace] = useState<{ side: 'left' | 'below'; top: number; left: number; arrow: number; detached: boolean }>(LEFT)
  const statusRef = useRef<HTMLSpanElement>(null)
  const naturalWidth = useRef(0)
  const refusalId = refusal?.id
  const refusalText = refusal?.text
  useEffect(() => {
    if (refusalId === undefined) return
    chipRef.current?.focus({ preventScroll: true })
    setPlace((p) => (p.side === 'left' ? p : LEFT)) // measure afresh
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
  const placeCallout = useCallback(() => {
    const chipEl = chipRef.current
    const box = statusRef.current?.querySelector<HTMLElement>('[data-refused]')
    if (!chipEl || !box) return
    const r = chipEl.getBoundingClientRect()
    if (box.dataset.refused === 'left') naturalWidth.current = box.offsetWidth // layout width, so an entry transform cannot shrink it
    // Room on the left is measured from the title button's right edge (plus the gap), not the window's
    // gutter, so the box never covers the title (Aurora-u8jx.4.1).
    const titleRight = document.querySelector<HTMLElement>('.editor-header .editor-title-menu')?.getBoundingClientRect().right ?? 0
    const leftBound = Math.max(GUTTER, titleRight + CALLOUT_GAP)
    const fits = r.left - CALLOUT_GAP - leftBound >= naturalWidth.current
    const right = window.innerWidth - GUTTER
    // The pointer sits over the chip's centre, kept inside the box's rounded corners.
    const arrow = Math.max(14, right - (r.left + r.width / 2))
    // Below the chip, keep off the canvas's Add node button: right of it when that leaves room, else under it.
    const add = document.querySelector<HTMLElement>('.editor-add-node')?.getBoundingClientRect()
    let top = r.bottom + 8
    let left = GUTTER
    let detached = false
    if (add && add.bottom + 4 > top && add.top < top + 60) {
      if (right - (add.right + CALLOUT_GAP) >= MIN_BELOW_WIDTH) left = add.right + CALLOUT_GAP
      else {
        top = add.bottom + 8
        detached = true
      }
    }
    setPlace((p) =>
      fits
        ? p.side === 'left' ? p : LEFT
        : p.side === 'below' && p.top === top && p.left === left && p.arrow === arrow && p.detached === detached ? p : { side: 'below', top, left, arrow, detached },
    )
  }, [chipRef])
  // Placed before paint, from the measured one-line width; re-placed if the window resizes meanwhile.
  // The chip may mount after the refusal (the server's verdict arrives later), hence `shown`.
  const shown = count > 0
  useLayoutEffect(() => {
    if (callout === null || !shown) return
    placeCallout()
    window.addEventListener('resize', placeCallout)
    return () => window.removeEventListener('resize', placeCallout)
  }, [callout, shown, placeCallout, place.side])
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
        <span
          role="status"
          ref={statusRef}
          className="editor-refused-status"
          data-place={place.side}
          data-detached={place.detached ? 'true' : undefined}
          style={place.side === 'below' ? ({ '--refused-top': `${place.top}px`, '--refused-left': `${place.left}px`, '--refused-arrow': `${place.arrow}px` } as CSSProperties) : undefined}
        >
          {callout !== null ? <span className="ui-tooltip editor-refused" data-refused={place.side}>{callout}</span> : null}
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
            {problems.graph.map((m) => {
              const action = problems.graphActions.get(m)
              return (
                <li key={`graph:${m}`} className="editor-problem-row">
                  <span className="editor-problem-text">
                    <strong>Whole graph</strong>
                    <span>{m}</span>
                  </span>
                  {action ? (
                    <Button
                      onPress={() => {
                        close()
                        onGraphAction(action.run)
                      }}
                    >
                      {action.label}
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Dialog>
      </EditorPopup>
    </>
  )
}
