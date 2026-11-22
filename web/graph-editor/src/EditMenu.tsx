import type { ReactNode, RefObject } from 'react'
import { Dialog, Icon, Menu, MenuItem, MenuSeparator, chevronDownIcon } from '@weblings_things/grille'
import { EditorPopup } from './EditorPopup'

export type EditAction = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'select-all' | 'tidy' | 'delete'

// A menu row: the label, with its key hint at the far end.
export function Keyed({ children, hint }: { children: ReactNode; hint: string }) {
  return (
    <span className="editor-menu-row">
      <span>{children}</span>
      <span className="editor-menu-key" aria-hidden="true">{hint}</span>
    </span>
  )
}

// The Edit dropdown beside the title (Aurora-ge1i.2): Undo and Redo, the clipboard, Select all and Delete.
export function EditMenu({
  isOpen,
  onOpen,
  onClose,
  triggerRef,
  disabled,
  canUndo,
  canRedo,
  hasSelection,
  canPaste,
  hints,
  onAction,
}: {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
  disabled: boolean
  canUndo: boolean
  canRedo: boolean
  hasSelection: boolean
  canPaste: boolean
  hints: Record<Exclude<EditAction, 'tidy'>, string>
  onAction: (action: EditAction) => void
}) {
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="ui-button editor-edit-menu"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => (isOpen ? onClose() : onOpen())}
      >
        Edit
        <Icon icon={chevronDownIcon} size="sm" />
      </button>
      <EditorPopup isOpen={isOpen} onClose={onClose} label="Edit menu" triggerRef={triggerRef}>
        <Dialog aria-label="Edit menu">
          <Menu
            aria-label="Edit actions"
            onClose={onClose}
            onAction={(id) => {
              onClose()
              onAction(id as EditAction)
            }}
          >
            <MenuItem id="undo" isDisabled={!canUndo}><Keyed hint={hints.undo}>Undo</Keyed></MenuItem>
            <MenuItem id="redo" isDisabled={!canRedo}><Keyed hint={hints.redo}>Redo</Keyed></MenuItem>
            <MenuSeparator />
            <MenuItem id="cut" isDisabled={!hasSelection}><Keyed hint={hints.cut}>Cut</Keyed></MenuItem>
            <MenuItem id="copy" isDisabled={!hasSelection}><Keyed hint={hints.copy}>Copy</Keyed></MenuItem>
            <MenuItem id="paste" isDisabled={!canPaste}><Keyed hint={hints.paste}>Paste</Keyed></MenuItem>
            <MenuSeparator />
            <MenuItem id="select-all"><Keyed hint={hints['select-all']}>Select all</Keyed></MenuItem>
            <MenuSeparator />
            <MenuItem id="tidy">Tidy</MenuItem>
            <MenuSeparator />
            <MenuItem id="delete" isDisabled={!hasSelection}><Keyed hint={hints.delete}>Delete</Keyed></MenuItem>
          </Menu>
        </Dialog>
      </EditorPopup>
    </>
  )
}
