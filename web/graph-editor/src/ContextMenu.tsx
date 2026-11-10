import { Dialog, Menu, MenuItem, MenuSeparator, SubmenuItem } from '@weblings/grille'
import { EditorPopup } from './EditorPopup'
import { Row } from './AddNodeMenu'
import { addGroups } from './graph/addMenu'
import type { Catalog } from './graph/types'

// Where a menu opened, and on what. Coordinates are viewport pixels: the
// pointer for a right-click, the button or node corner for the keyboard routes.
export type MenuTarget =
  | { kind: 'canvas'; x: number; y: number }
  | { kind: 'node'; x: number; y: number; id: string }
  | { kind: 'edge'; x: number; y: number; id: string }

export type MenuAction =
  | { type: 'add'; nodeType: string }
  | { type: 'undo' | 'redo' | 'fit' | 'details' | 'dashboard' | 'delete-nodes' | 'delete-edge' }

// Right-click and ⋯ menus (Aurora-daaa.27.1): canvas, node and wire. One popup
// anchored at a point; keyed on it so a second right-click moves the menu.
export function ContextMenu({
  target,
  catalog,
  canUndo,
  canRedo,
  selectedCount,
  onClose,
  onAction,
}: {
  target: MenuTarget | null
  catalog: Catalog
  canUndo: boolean
  canRedo: boolean
  selectedCount: number
  onClose: () => void
  onAction: (action: MenuAction) => void
}) {
  if (!target) return null
  const run = (a: MenuAction) => {
    onClose()
    onAction(a)
  }
  const label = target.kind === 'canvas' ? 'Canvas menu' : target.kind === 'node' ? 'Node menu' : 'Connection menu'
  return (
    <EditorPopup key={`${target.kind}:${target.x},${target.y}`} isOpen onClose={onClose} label={label} point={{ x: target.x, y: target.y }}>
      <Dialog aria-label={label}>
        {target.kind === 'canvas' ? (
          <Menu
            aria-label="Canvas actions"
            onClose={onClose}
            onAction={(id) => {
              if (id === 'undo' || id === 'redo' || id === 'fit') run({ type: id })
            }}
          >
            <SubmenuItem id="add" label="Add node" aria-label="Add node" onAction={(type) => run({ type: 'add', nodeType: type })}>
              {addGroups(catalog).map((g) => (
                <SubmenuItem key={g.name} id={`group:${g.name}`} label={g.name} aria-label={`${g.name} nodes`} onAction={(type) => run({ type: 'add', nodeType: type })}>
                  {g.types.map((i) => (
                    <MenuItem key={i.type} id={i.type}>
                      <Row info={i} />
                    </MenuItem>
                  ))}
                </SubmenuItem>
              ))}
            </SubmenuItem>
            <MenuSeparator />
            <MenuItem id="undo" isDisabled={!canUndo}>Undo</MenuItem>
            <MenuItem id="redo" isDisabled={!canRedo}>Redo</MenuItem>
            <MenuItem id="fit">Fit view</MenuItem>
          </Menu>
        ) : target.kind === 'node' ? (
          <Menu
            aria-label="Node actions"
            onClose={onClose}
            onAction={(id) => {
              if (id === 'details' || id === 'dashboard' || id === 'delete-nodes') run({ type: id })
            }}
          >
            <MenuItem id="details">Details</MenuItem>
            <MenuItem id="dashboard">Show on the Dashboard</MenuItem>
            <MenuSeparator />
            <MenuItem id="delete-nodes">{selectedCount > 1 ? `Delete ${selectedCount} nodes` : 'Delete node'}</MenuItem>
          </Menu>
        ) : (
          <Menu aria-label="Connection actions" onClose={onClose} onAction={() => run({ type: 'delete-edge' })}>
            <MenuItem id="delete-edge">Delete connection</MenuItem>
          </Menu>
        )}
      </Dialog>
    </EditorPopup>
  )
}
