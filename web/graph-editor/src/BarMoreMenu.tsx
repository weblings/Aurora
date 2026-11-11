import { useRef, useState } from 'react'
import { Dialog, Menu, MenuItem } from '@weblings/grille'
import { EditorPopup } from './EditorPopup'

// The top bar's More menu, shown only where Undo and Redo no longer fit (Aurora-daaa.29.1).
export function BarMoreMenu({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = () => setOpen(false)
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="ui-button"
        data-size="sm"
        aria-label="More"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      <EditorPopup isOpen={open} onClose={close} label="More" triggerRef={trigger}>
        <Dialog aria-label="More">
          <Menu
            aria-label="More actions"
            onClose={close}
            onAction={(id) => {
              close()
              if (id === 'undo') onUndo()
              else if (id === 'redo') onRedo()
            }}
          >
            <MenuItem id="undo" isDisabled={!canUndo}>Undo</MenuItem>
            <MenuItem id="redo" isDisabled={!canRedo}>Redo</MenuItem>
          </Menu>
        </Dialog>
      </EditorPopup>
    </>
  )
}
