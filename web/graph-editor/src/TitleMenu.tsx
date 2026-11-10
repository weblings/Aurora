import type { RefObject } from 'react'
import { Dialog, Menu, MenuItem, MenuSeparator } from '@weblings/grille'
import { EditorPopup } from './EditorPopup'
import type { EffectListEntry } from './graph/types'

export type TitleMenuAction = 'save' | 'save-as-new' | 'save-and-apply' | 'rename' | 'new'

// The title menu (Aurora-daaa.11): a Dialog in a Popover with the file actions and the effect list. Effects open on Enter or a click, never
// on the arrow keys, which only move focus.
export function TitleMenu({
  isOpen,
  onClose,
  triggerRef,
  isBuiltin,
  busy,
  blocked,
  editedSinceTest,
  otherEffects,
  onAction,
  onOpenEffect,
}: {
  isOpen: boolean
  onClose: () => void
  triggerRef: RefObject<HTMLElement | null>
  isBuiltin: boolean
  busy: boolean
  // No Aurora to talk to: nothing here can run.
  blocked: boolean
  editedSinceTest: boolean
  otherEffects: EffectListEntry[]
  onAction: (action: TitleMenuAction) => void
  onOpenEffect: (id: string) => void
}) {
  const off = busy || blocked
  return (
    <EditorPopup isOpen={isOpen} onClose={onClose} label="Effect menu" triggerRef={triggerRef}>
      <Dialog aria-label="Effect menu">
        <div className="editor-title-dialog">
          {editedSinceTest ? (
            <p className="editor-name-note">Edited since the test. Save and apply puts the edited graph live and ends the test.</p>
          ) : null}
          <Menu
            aria-label="Effect actions"
            onClose={onClose}
            onAction={(id) => {
              onClose()
              onAction(id as TitleMenuAction)
            }}
          >
            <MenuItem id="save" isDisabled={off}>Save</MenuItem>
            {isBuiltin ? null : <MenuItem id="save-as-new" isDisabled={off}>Save as new</MenuItem>}
            <MenuItem id="save-and-apply" isDisabled={off}>Save and apply</MenuItem>
            {isBuiltin ? null : <MenuItem id="rename">Rename…</MenuItem>}
            <MenuSeparator />
            <MenuItem id="new">New empty effect</MenuItem>
          </Menu>
          {otherEffects.length > 0 ? (
            <>
              <h4 className="editor-title-heading">Open another effect</h4>
              <div className="editor-effect-list">
                <Menu
                  aria-label="Open another effect"
                  autoFocus={false}
                  onClose={onClose}
                  onAction={(id) => {
                    onClose()
                    onOpenEffect(id)
                  }}
                >
                  {otherEffects.map((e) => (
                    <MenuItem key={e.id} id={e.id}>{e.title || e.id}</MenuItem>
                  ))}
                </Menu>
              </div>
            </>
          ) : null}
        </div>
      </Dialog>
    </EditorPopup>
  )
}
