import { useMemo, type MutableRefObject, type ReactNode, type RefObject } from 'react'
import { Dialog, Menu, MenuItem, MenuSection, MenuSeparator, SubmenuItem } from '@weblings_things/grille'
import { EditorPopup } from './EditorPopup'
import { keptCopies } from './graph/autosave'
import { openGroups, startGroups, startPoints } from './graph/titleMenu'
import { BLANK_ID } from './graph/save'
import type { EffectListEntry } from './graph/types'

// The screen-reader text of every unsaved asterisk: MenuItem `description` on an item, hidden text on a heading.
export const UNSAVED_TEXT = 'unsaved changes'

const FROM_FILE = '@from-file'

export type TitleMenuAction = 'save' | 'save-as-new' | 'save-and-apply' | 'rename' | 'duplicate' | 'revert' | 'export'

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
  effects,
  currentId,
  hasAudio,
  unsaved,
  focusAfter,
  onAction,
  onOpenEffect,
  onNewEffect,
  onFromFile,
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
  effects: EffectListEntry[]
  currentId: string
  // An audio input exists: only then does New offer Music pulse.
  hasAudio: boolean
  // The open graph differs from the saved one: only then is there anything to revert.
  unsaved: boolean
  focusAfter: MutableRefObject<(() => HTMLElement | null) | null>
  onAction: (action: TitleMenuAction) => void
  onOpenEffect: (id: string) => void
  // A New pick: Empty opens blank, anything else opens an unsaved copy of that effect.
  onNewEffect: (id: string) => void
  // New > From file and Open > From file (Aurora-dzsd): pick a graph file, open it as a new unsaved effect.
  onFromFile: () => void
}) {
  // Save, Save as new and Save and apply are never disabled for problems (Aurora-u68h.4): React Aria skips
  // disabled items on arrow keys, so a reason on one would never reach a keyboard user. With problems
  // they refuse and point at the chip instead (App's write).
  const off = busy || blocked
  // Read when the menu opens: kept copies change while editing, the open effect's is not listed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const kept = useMemo(() => (isOpen ? keptCopies() : new Map()), [isOpen, effects])
  const groups = openGroups(effects, currentId, kept)
  const starts = startGroups(effects, hasAudio)
  // A draft id never names a stored effect, so it cannot collide with one.
  const pick = (id: string) => {
    onClose()
    if (id === FROM_FILE) onFromFile()
    else onOpenEffect(id)
  }
  const pickNew = (id: string) => {
    onClose()
    if (id === FROM_FILE) onFromFile()
    else onNewEffect(id)
  }
  return (
    <EditorPopup isOpen={isOpen} onClose={onClose} label="Effect menu" triggerRef={triggerRef} focusAfter={focusAfter}>
      <Dialog aria-label="Effect menu">
        <div className="editor-title-dialog">
          <Menu
            aria-label="Effect actions"
            onClose={onClose}
            onAction={(id) => {
              if (id === 'new' || id === 'open' || id.startsWith('start-')) return
              onClose()
              onAction(id as TitleMenuAction)
            }}
          >
            <MenuItem id="save" isDisabled={off}>Save</MenuItem>
            {isBuiltin ? null : <MenuItem id="save-as-new" isDisabled={off}>Save as new</MenuItem>}
            <MenuItem id="save-and-apply" isDisabled={off}>Save and apply</MenuItem>
            {isBuiltin ? null : <MenuItem id="rename" isDisabled={nothingOpen}>Rename</MenuItem>}
            <MenuItem id="duplicate" isDisabled={nothingOpen}>Duplicate</MenuItem>
            <MenuItem id="revert" isDisabled={!unsaved}>Revert to saved</MenuItem>
            <MenuItem id="export" isDisabled={nothingOpen}>Export graph</MenuItem>
            <MenuSeparator />
            <SubmenuItem id="new" label="New" aria-label="New effect" onAction={pickNew}>
              <MenuSection title="Start from">
                {startPoints(effects, hasAudio).filter((s) => s.id === BLANK_ID).map((s) => (
                  <MenuItem key={s.id} id={s.id}>{s.title}</MenuItem>
                ))}
                {starts.map((g) => (
                  <SubmenuItem key={g.name} id={`start-${g.name}`} label={g.name} aria-label={`Start from a ${g.name.toLowerCase()} effect`} onAction={pickNew}>
                    {g.items.map((e) => (
                      <MenuItem key={e.id} id={e.id} tooltip={e.title} tooltipOnlyWhenTruncated>
                        {e.title}
                      </MenuItem>
                    ))}
                  </SubmenuItem>
                ))}
              </MenuSection>
              <MenuSection title="File">
                <MenuItem id={FROM_FILE}>From file...</MenuItem>
              </MenuSection>
            </SubmenuItem>
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
                        {e.unsaved ? <span className="editor-unsaved-mark" aria-hidden="true">*</span> : null}
                      </span>
                    </MenuItem>
                  ))}
                </MenuSection>
              ))}
              <MenuSection title="File">
                <MenuItem id={FROM_FILE}>From file...</MenuItem>
              </MenuSection>
            </SubmenuItem>
          </Menu>
        </div>
      </Dialog>
    </EditorPopup>
  )
}

// "Not saved yet" ends with the asterisk, with the same screen-reader text as an item's.
function headingOf(name: string, unsaved: boolean): ReactNode {
  if (!unsaved) return name
  return (
    <span className="editor-heading-mark">
      {name}
      <span className="editor-unsaved-mark" aria-hidden="true">*</span>
      <span className="visually-hidden">, {UNSAVED_TEXT}</span>
    </span>
  )
}
