import type { RefObject } from 'react'
import { Dialog, Menu, MenuItem, MenuSection, MenuSeparator, SubmenuItem } from '@weblings/grille'
import { EditorPopup } from './EditorPopup'
import { Hint } from './Hint'
import { openGroups, startPoints } from './graph/titleMenu'
import type { EffectListEntry } from './graph/types'

// Titles past this may be cut off by the ellipsis (editor-menu-title, 30ch); only they get a Hint, because the
// Hint makes its child a tab stop inside the menu item.
const LONG_TITLE = 24

export type TitleMenuAction = 'save' | 'save-as-new' | 'save-and-apply' | 'rename' | 'revert'

// The title menu (Aurora-daaa.11): a Dialog in a Popover with the file actions, then New and Open
// submenus (Aurora-iryq). One menu, so the arrow keys reach everything; effects open on Enter or a
// click, never on the arrow keys, which only move focus.
export function TitleMenu({
  isOpen,
  onClose,
  triggerRef,
  isBuiltin,
  busy,
  blocked,
  editedSinceTest,
  effects,
  currentId,
  hasAudio,
  unsaved,
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
  effects: EffectListEntry[]
  currentId: string
  // An audio input exists: only then does New offer Music pulse.
  hasAudio: boolean
  // The open graph differs from the saved one: only then is there anything to revert.
  unsaved: boolean
  onAction: (action: TitleMenuAction) => void
  // New and Open both land here; App's openEffect decides where it opens.
  onOpenEffect: (id: string) => void
}) {
  const off = busy || blocked
  const groups = openGroups(effects, currentId)
  const pick = (id: string) => {
    onClose()
    onOpenEffect(id)
  }
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
              if (id === 'new' || id === 'open') return
              onClose()
              onAction(id as TitleMenuAction)
            }}
          >
            <MenuItem id="save" isDisabled={off}>Save</MenuItem>
            {isBuiltin ? null : <MenuItem id="save-as-new" isDisabled={off}>Save as new</MenuItem>}
            <MenuItem id="save-and-apply" isDisabled={off}>Save and apply</MenuItem>
            {isBuiltin ? null : <MenuItem id="rename">Rename</MenuItem>}
            <MenuItem id="revert" isDisabled={!unsaved}>Revert to saved</MenuItem>
            <MenuSeparator />
            <SubmenuItem id="new" label="New" aria-label="New effect" onAction={pick}>
              <MenuSection title="Start from">
                {startPoints(effects, hasAudio).map((s) => (
                  <MenuItem key={s.id} id={s.id}>{s.title}</MenuItem>
                ))}
              </MenuSection>
            </SubmenuItem>
            {groups.length > 0 ? (
              <SubmenuItem id="open" label="Open" aria-label="Open another effect" onAction={pick}>
                {groups.map((g) => (
                  <MenuSection key={g.name} title={g.name}>
                    {g.items.map((e) => (
                      <MenuItem key={e.id} id={e.id}>
                        <Hint text={e.title.length > LONG_TITLE ? e.title : null}><span className="editor-menu-title">{e.title}</span></Hint>
                      </MenuItem>
                    ))}
                  </MenuSection>
                ))}
              </SubmenuItem>
            ) : null}
          </Menu>
        </div>
      </Dialog>
    </EditorPopup>
  )
}
