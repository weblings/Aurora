import { useRef } from 'react'
import { Hint } from './Hint'

export const TUNING_KEY = 'T'
// Height of the tab that sits above the full-height dock (Aurora-e4bi.12).
export const GRAB_TAB = 24

type Props = {
  side: 'right' | 'bottom'
  open: boolean
  full: boolean
  count: number
  // 1 grows (opens, then full height), -1 shrinks (half, then closed), 0 is a click.
  onStep: (dir: 1 | -1 | 0) => void
}

// The Tuning drawer's grab tab: on its inner edge in every state, the only way to reopen it.
// Docked: click toggles half and full, drag or Up and Down step. Beside: click, drag or Left and Right.
export function GrabTab({ side, open, full, count, onStep }: Props) {
  const vertical = side === 'right'
  const start = useRef<number | null>(null)
  const moved = useRef(false)
  const pos = (e: React.PointerEvent) => (vertical ? e.clientX : e.clientY)
  const label = !open
    ? `Show Tuning, ${count} ${count === 1 ? 'control' : 'controls'}`
    : vertical
      ? 'Hide Tuning'
      : full
        ? 'Tuning height: full. Press for half height'
        : 'Tuning height: half. Press for full height'
  const tip = !open
    ? [`Show Tuning (${TUNING_KEY})`]
    : vertical
      ? [`Hide Tuning (${TUNING_KEY})`, 'Drag right to hide']
      : ['Drag or press Up and Down to resize', 'Click to toggle full height', `Hide Tuning (${TUNING_KEY})`]
  const state = !open ? 'closed' : vertical ? 'right' : full ? 'full' : 'half'
  return (
    <div className="editor-grab" data-place={side} data-state={state}>
      <Hint text={tip} placement={vertical ? 'left' : 'top'}>
        <button
          type="button"
          className="editor-grab-tab"
          aria-label={label}
          aria-keyshortcuts={TUNING_KEY}
          onPointerDown={(e) => {
            start.current = pos(e)
            moved.current = false
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerUp={(e) => {
            const d = start.current === null ? 0 : pos(e) - start.current
            start.current = null
            // Up and Left grow, so a drag toward the screen's top or left edge grows.
            if (Math.abs(d) > 40) {
              moved.current = true
              onStep(d < 0 ? 1 : -1)
            }
          }}
          onClick={() => {
            if (!moved.current) onStep(0)
            moved.current = false
          }}
          onKeyDown={(e) => {
            const grow = vertical ? 'ArrowLeft' : 'ArrowUp'
            const shrink = vertical ? 'ArrowRight' : 'ArrowDown'
            if (e.key === grow || e.key === shrink) {
              e.preventDefault()
              onStep(e.key === grow ? 1 : -1)
            }
          }}
        >
          <span className="editor-grab-pill" />
        </button>
      </Hint>
    </div>
  )
}
