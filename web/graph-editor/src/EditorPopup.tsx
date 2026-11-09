import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { Popover, type PopoverPoint } from '@weblings/grille'

// The editor's popup layer, over Grille's Popover. Every editor menu (title,
// view, context) goes through it, so the React Flow cases live in one place
// (Aurora-t2hz). Grille stays free of React Flow.
//
// - Non-modal: the canvas keeps wheel zoom, clicks and right-clicks while a
//   menu is open.
// - Delete and Backspace never reach React Flow's document listener from
//   inside the popup (only those two keys, so Esc still works).
// - A press anywhere outside closes it, so a pane drag dismisses the menu too.
// - Esc closes it even while focus is outside the popup.
// - Focus goes back to the element that had it when the popup opened (or the
//   trigger); the popup never leaves it on <body>.
// - Menu items do not commit on arrow keys: the menu only moves focus there.
export function EditorPopup({
  isOpen,
  onClose,
  label,
  triggerRef,
  point,
  children,
}: {
  isOpen: boolean
  onClose: () => void
  label: string
  triggerRef?: RefObject<HTMLElement | null>
  point?: PopoverPoint
  children: ReactNode
}) {
  const close = useRef(onClose)
  close.current = onClose
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const press = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (box.current?.contains(target) || triggerRef?.current?.contains(target)) return
      // Stray presses on the overlay a popover portals into count as inside.
      if (target instanceof Element && target.closest('.ui-popover')) return
      close.current()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
    }
    document.addEventListener('pointerdown', press, true)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', press, true)
      document.removeEventListener('keydown', key)
    }
  }, [isOpen, triggerRef])

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      triggerRef={triggerRef}
      point={point}
      isNonModal
      aria-label={label}
      onRestoreFocus={(previous) => (previous ?? triggerRef?.current)?.focus()}
    >
      <div
        ref={box}
        className="editor-popup"
        onKeyDown={(e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') e.stopPropagation()
        }}
      >
        {children}
      </div>
    </Popover>
  )
}
