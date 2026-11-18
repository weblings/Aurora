import { useRef, useState, type ReactNode } from 'react'
import { EditorPopup } from './EditorPopup'
import { Hint } from './Hint'

// Hint for the mouse and keyboard, and on a touch tap the same text in a popover: React Aria's tooltip never
// opens from a tap. nodrag keeps a jittery tap from nudging the node (Aurora-e4bi.9).
export function TapHint({ text, label, children }: { text: string | readonly string[] | null | undefined; label: string; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  const pointer = useRef('')
  const [open, setOpen] = useState(false)
  const lines = typeof text === 'string' ? [text] : [...(text ?? [])]
  if (lines.length === 0 || lines.every((l) => l === '')) return <>{children}</>
  return (
    <>
      <span
        ref={ref}
        className="aurora-taphint nodrag"
        data-open={open || undefined}
        onPointerDown={(e) => (pointer.current = e.pointerType)}
        onClick={() => pointer.current === 'touch' && setOpen((o) => !o)}
      >
        <Hint text={lines}>{children}</Hint>
      </span>
      <EditorPopup isOpen={open} onClose={() => setOpen(false)} label={label} triggerRef={ref} placement="top">
        <div className="aurora-taphint-pop">
          {lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      </EditorPopup>
    </>
  )
}
