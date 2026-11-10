import chevronDown from '../../ui/icons/chevron-down.svg'
import chevronUp from '../../ui/icons/chevron-up.svg'
import { useRef, useState } from 'react'
import { Panel, useReactFlow, useStore } from '@xyflow/react'
import { Dialog, Menu, MenuItem } from '@weblings/grille'
import { EditorPopup } from './EditorPopup'

// Zoom, fit and the minimap, in one menu in place of React Flow's controls.
// Rendered inside <ReactFlow>, so it can reach the view.
// Fit view never zooms out below readable node text: a long chain overflows the
// canvas and is panned, not shrunk to a thin strip (Aurora-daaa.18).
export const FIT_OPTIONS = { minZoom: 0.6, maxZoom: 1 }

export function ViewMenu({ minimap, onMinimap }: { minimap: boolean; onMinimap: (on: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const zoom = useStore((s) => s.transform[2])
  const close = () => setOpen(false)
  return (
    <Panel position="bottom-left">
      <button
        ref={trigger}
        type="button"
        className="btn btn-secondary editor-view-menu"
        aria-label="View menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        View {Math.round(zoom * 100)}%
        <img className="editor-chevron" src={open ? chevronUp : chevronDown} alt="" />
      </button>
      <EditorPopup isOpen={open} onClose={close} label="View menu" triggerRef={trigger}>
        <Dialog aria-label="View menu">
          <Menu
            aria-label="View actions"
            onClose={close}
            onAction={(id) => {
              close()
              if (id === 'in') void zoomIn({ duration: 120 })
              else if (id === 'out') void zoomOut({ duration: 120 })
              else if (id === 'fit') void fitView({ ...FIT_OPTIONS, duration: 200 })
              else if (id === 'minimap') onMinimap(!minimap)
            }}
          >
            <MenuItem id="in">Zoom in</MenuItem>
            <MenuItem id="out">Zoom out</MenuItem>
            <MenuItem id="fit">Fit view</MenuItem>
            <MenuItem id="minimap">{minimap ? 'Hide minimap' : 'Show minimap'}</MenuItem>
          </Menu>
        </Dialog>
      </EditorPopup>
    </Panel>
  )
}
