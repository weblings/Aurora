import { Button } from '@weblings/grille'
import { useCallback, useEffect, useRef, useState } from 'react'

const TOAST_MS = 3000
// A toast that carries Undo stays up longer: there is a button to reach and a loss to weigh.
export const UNDO_TOAST_MS = 8000

export type ToastUndo = {
  // Runs the undo. The caller decides what that means (a history undo, or restoring a kept copy).
  run: () => void
  // The document the action left behind. Any other document (another edit, an undo, another effect)
  // spends the offer, so Undo never acts on a graph the user has moved on from.
  doc: unknown
}

type Shown = { text: string; undo?: ToastUndo }

// One toast at a time, bottom centre, gone after 3 s (8 s with Undo; the timer pauses while it is
// hovered or holds focus). Only for a success or a minor refusal the user caused a moment ago (status
// priority rule): an error never goes here, because a toast disappears.
export function useToast() {
  const [shown, setShown] = useState<Shown | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const deadline = useRef(0)
  const held = useRef(false)
  const arm = useCallback((ms: number) => {
    window.clearTimeout(timer.current)
    deadline.current = Date.now() + ms
    timer.current = window.setTimeout(() => setShown(null), ms)
  }, [])
  const show = useCallback(
    (message: string, undo?: ToastUndo) => {
      held.current = false
      setShown({ text: message, undo })
      arm(undo ? UNDO_TOAST_MS : TOAST_MS)
    },
    [arm],
  )
  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current)
    setShown(null)
  }, [])
  // Hover or focus holds the clock; leaving resumes with what was left (at least 1.5 s to read on).
  const hold = useCallback(
    (on: boolean) => {
      if (on === held.current) return
      held.current = on
      if (on) {
        window.clearTimeout(timer.current)
        deadline.current = Math.max(deadline.current - Date.now(), 1500)
      } else {
        arm(deadline.current)
      }
    },
    [arm],
  )
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return { text: shown?.text ?? null, undo: shown?.undo ?? null, show, dismiss, hold }
}

export function Toast({
  text,
  undo,
  onUndo,
  onHold,
}: {
  text: string | null
  undo?: ToastUndo | null
  onUndo?: () => void
  onHold?: (on: boolean) => void
}) {
  // The text sits in a live region that stays mounted so a screen reader hears the change. Undo is a
  // real button after it: it never takes focus by itself, and Ctrl/Cmd+Z stays the keyboard path.
  const hovered = useRef(false)
  const focused = useRef(false)
  const box = useRef<HTMLDivElement>(null)
  const report = () => onHold?.(hovered.current || focused.current)
  // A toast that closed under the pointer, or with Undo focused, never saw mouseleave or blur (its
  // button was removed), so a new toast starts from what is true now.
  useEffect(() => {
    hovered.current = box.current?.matches(':hover') ?? false
    focused.current = box.current?.contains(document.activeElement) ?? false
  }, [text])
  return (
    <div
      ref={box}
      className="editor-toast"
      data-shown={text ? 'true' : 'false'}
      data-undo={undo ? 'true' : 'false'}
      onMouseEnter={() => {
        hovered.current = true
        report()
      }}
      onMouseLeave={() => {
        hovered.current = false
        report()
      }}
      onFocus={() => {
        focused.current = true
        report()
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        focused.current = false
        report()
      }}
    >
      <span role="status" aria-live="polite">
        {text}
      </span>
      {text && undo ? (
        <Button size="sm" onPress={onUndo}>
          Undo
        </Button>
      ) : null}
    </div>
  )
}
