import { useMemo, type MutableRefObject, type ReactNode, type RefObject } from 'react'
import { Dialog, Icon, Menu, MenuItem, MenuSection, MenuSeparator, SubmenuItem, dotIcon } from '@weblings/grille'
import { EditorPopup } from './EditorPopup'
import { keptCopies } from './graph/autosave'
import { openGroups, startPoints } from './graph/titleMenu'
import type { EffectListEntry } from './graph/types'

// The screen-reader text of every unsaved dot: MenuItem `description` on an item, hidden text on a heading.
export const UNSAVED_TEXT = 'unsaved changes'

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
  nothingOpen,
  editedSinceTest,
  effects,
  currentId,
  hasAudio,
  unsaved,
  focusAfter,
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
  // The effect would not load: there is no document, so only Open and New apply.
  nothingOpen: boolean
  editedSinceTest: boolean
  effects: EffectListEntry[]
  currentId: string
  // An audio input exists: only then does New offer Music pulse.
  hasAudio: boolean
  // The open graph differs from the saved one: only then is there anything to revert.
  unsaved: boolean
  focusAfter: MutableRefObject<(() => HTMLElement | null) | null>
  onAction: (action: TitleMenuAction) => void
  // New and Open both land here; App's openEffect decides where it opens.
  onOpenEffect: (id: string) => void
}) {
  // Save, Save as new and Save and apply are never disabled for problems (Aurora-u68h.4): React Aria skips
  // disabled items on arrow keys, so a reason on one would never reach a keyboard user. With problems
  // they refuse and point at the chip instead (App's write).
  const off = busy || blocked
  // Read when the menu opens: kept copies change while editing, the open effect's is not listed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const kept = useMemo(() => (isOpen ? keptCopies() : new Map()), [isOpen, effects])
  const groups = openGroups(effects, currentId, kept)
  const pick = (id: string) => {
    onClose()
    onOpenEffect(id)
  }
  return (
    <EditorPopup isOpen={isOpen} onClose={onClose} label="Effect menu" triggerRef={triggerRef} focusAfter={focusAfter}>
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
            {isBuiltin ? null : <MenuItem id="rename" isDisabled={nothingOpen}>Rename</MenuItem>}
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
                  <MenuSection key={g.name} title={headingOf(g.name, g.unsaved)}>
                    {g.items.map((e) => (
                      <MenuItem
                        key={e.id}
                        id={e.id}
                        description={e.unsaved ? UNSAVED_TEXT : undefined}
                        tooltip={e.title}
                        tooltipOnlyWhenTruncated
                      >
                        <span className="editor-menu-line">
                          <span className="editor-menu-title">{e.title}</span>
                          {e.unsaved ? <Icon icon={dotIcon} size="sm" /> : null}
                        </span>
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

// "Not saved yet" ends with the dot, with the same screen-reader text as an item's. Grille types a
// MenuSection title as a string but draws it as the Header's children, so a node works (reported on
// the bead for Grille to type as ReactNode).
function headingOf(name: string, unsaved: boolean): string {
  if (!unsaved) return name
  const node: ReactNode = (
    <span className="editor-heading-dot">
      {name}
      <Icon icon={dotIcon} size="sm" />
      <span className="visually-hidden">, {UNSAVED_TEXT}</span>
    </span>
  )
  return node as unknown as string
}
