import { Dialog, Menu, MenuItem, MenuSeparator, SubmenuItem } from '@weblings_things/grille'
import { EditorPopup } from './EditorPopup'
import { Row } from './AddNodeMenu'
import { Keyed } from './EditMenu'
import { hints } from './graph/keys'
import { addGroups } from './graph/addMenu'
import type { Catalog } from './graph/types'

// Where a menu opened, and on what. Coordinates are viewport pixels: the
// pointer for a right-click, the button or node corner for the keyboard routes.
export type MenuTarget =
  | { kind: 'canvas'; x: number; y: number }
  // `touch`, `tip` and `params` are filled in by App: the touch press of ..., the node's short tip, whether it has params.
  | { kind: 'node'; x: number; y: number; id: string; count?: number; touch?: boolean; tip?: string; params?: boolean }
  | { kind: 'edge'; x: number; y: number; id: string }
  | { kind: 'param'; x: number; y: number; id: string; param: string; label: string; on: boolean }

export type MenuAction =
  | { type: 'add'; nodeType: string }
  | { type: 'undo' | 'redo' | 'fit' | 'tidy' | 'dashboard' | 'cut' | 'copy' | 'paste' | 'select-all' | 'delete-nodes' | 'delete-edge' }
  | { type: 'tuning-add' | 'tuning-remove' }

// Right-click and node-button menus (Aurora-daaa.27.1): canvas, node and wire. One popup
// anchored at a point; keyed on it so a second right-click moves the menu.
export function ContextMenu({
  target,
  catalog,
  canUndo,
  canRedo,
  canPaste,
  onClose,
  onAction,
}: {
  target: MenuTarget | null
  catalog: Catalog
  canUndo: boolean
  canRedo: boolean
  // False only when the clipboard is known to hold no Aurora nodes; an unreadable one stays enabled.
  canPaste: boolean
  onClose: () => void
  onAction: (action: MenuAction) => void
}) {
  if (!target) return null
  const run = (a: MenuAction) => {
    onClose()
    onAction(a)
  }
  const label = target.kind === 'canvas' ? 'Canvas menu' : target.kind === 'node' ? 'Node menu' : target.kind === 'param' ? `${target.label} menu` : 'Connection menu'
  return (
    <EditorPopup key={`${target.kind}:${target.x},${target.y}`} isOpen onClose={onClose} label={label} point={{ x: target.x, y: target.y }}>
      <Dialog aria-label={label}>
        {target.kind === 'canvas' ? (
          <Menu
            aria-label="Canvas actions"
            onClose={onClose}
            onAction={(id) => {
              if (id === 'undo' || id === 'redo' || id === 'fit' || id === 'tidy' || id === 'paste' || id === 'select-all') run({ type: id })
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
            <MenuItem id="undo" isDisabled={!canUndo}><Keyed hint={hints.undo}>Undo</Keyed></MenuItem>
            <MenuItem id="redo" isDisabled={!canRedo}><Keyed hint={hints.redo}>Redo</Keyed></MenuItem>
            <MenuItem id="fit">Fit view</MenuItem>
            <MenuItem id="tidy">Tidy</MenuItem>
            <MenuSeparator />
            <MenuItem id="paste" isDisabled={!canPaste}><Keyed hint={hints.paste}>Paste</Keyed></MenuItem>
            <MenuItem id="select-all"><Keyed hint={hints['select-all']}>Select all</Keyed></MenuItem>
          </Menu>
        ) : target.kind === 'node' ? (
          <>
            {target.touch && target.tip ? <p className="menu-tip">{target.tip}</p> : null}
          <Menu
            aria-label="Node actions"
            onClose={onClose}
            onAction={(id) => {
              if (id === 'dashboard' || id === 'cut' || id === 'copy' || id === 'delete-nodes' || id === 'tidy') run({ type: id })
            }}
          >
            {target.params ? <MenuItem id="dashboard">Tuning controls…</MenuItem> : null}
            {target.params ? <MenuSeparator /> : null}
            {(target.count ?? 1) > 1 ? <MenuItem id="tidy">Tidy</MenuItem> : null}
            {(target.count ?? 1) > 1 ? <MenuSeparator /> : null}
            <MenuItem id="cut"><Keyed hint={hints.cut}>Cut</Keyed></MenuItem>
            <MenuItem id="copy"><Keyed hint={hints.copy}>Copy</Keyed></MenuItem>
            <MenuSeparator />
            <MenuItem id="delete-nodes"><Keyed hint={hints.delete}>Delete</Keyed></MenuItem>
          </Menu>
          </>
        ) : target.kind === 'param' ? (
          <Menu aria-label={`${target.label} actions`} onClose={onClose} onAction={() => run({ type: target.on ? 'tuning-remove' : 'tuning-add' })}>
            <MenuItem id="tuning">{target.on ? 'Remove from Tuning' : 'Add to Tuning'}</MenuItem>
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
