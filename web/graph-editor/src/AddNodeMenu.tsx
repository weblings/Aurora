import { useState, type RefObject } from 'react'
import { Autocomplete, Dialog, ListBox, ListBoxItem, Menu, MenuItem, Section, SubmenuItem } from '@weblings/grille'
import { EditorPopup } from './EditorPopup'
import { addGroups, searchNodes, summaryOf, tipOf } from './graph/addMenu'
import type { Catalog, NodeTypeInfo } from './graph/types'

// A node row: name and summary. The tip rides as the hover title.
export function Row({ info }: { info: NodeTypeInfo }) {
  return (
    <span className="add-row" title={tipOf(info) || undefined}>
      <span className="add-row-head">
        <span className="add-row-name">{info.title || info.type}</span>
      </span>
      <span className="add-row-summary">{summaryOf(info)}</span>
    </span>
  )
}

const textOf = (i: NodeTypeInfo) => `${i.title} ${i.type} ${i.summary} ${i.tip} ${i.purpose} ${i.useWhen} ${i.group}`

// The cascade Add node menu (Aurora-daaa.24.3). No query: a row per group, each
// opening a flyout of that group's nodes. With a query: a flat ranked list,
// name matches first, description matches under their own heading.
export function AddNodeMenu({
  isOpen,
  onClose,
  triggerRef,
  catalog,
  onAdd,
}: {
  isOpen: boolean
  onClose: () => void
  triggerRef: RefObject<HTMLElement | null>
  catalog: Catalog
  onAdd: (type: string) => void
}) {
  const [query, setQuery] = useState('')
  const close = () => {
    setQuery('')
    onClose()
  }
  const pick = (type: string) => {
    close()
    onAdd(type)
  }
  const searching = query.trim() !== ''
  const found = searchNodes(catalog, query)
  return (
    <EditorPopup isOpen={isOpen} onClose={close} label="Add node" triggerRef={triggerRef}>
      <Dialog aria-label="Add node">
        <div className="add-menu">
          <Autocomplete label="Search nodes" placeholder="Search nodes" autoFocus value={query} onChange={setQuery}>
            {searching ? (
              <ListBox aria-label="Matching nodes" onAction={pick} emptyMessage="No node matches.">
                {found.byName.length > 0 ? (
                  <Section title="Name matches">
                    {found.byName.map((i) => (
                      <ListBoxItem key={i.type} id={i.type} textValue={textOf(i)}>
                        <Row info={i} />
                      </ListBoxItem>
                    ))}
                  </Section>
                ) : null}
                {found.byText.length > 0 ? (
                  <Section title="Description matches">
                    {found.byText.map((i) => (
                      <ListBoxItem key={i.type} id={i.type} textValue={textOf(i)}>
                        <Row info={i} />
                      </ListBoxItem>
                    ))}
                  </Section>
                ) : null}
              </ListBox>
            ) : (
              <Menu aria-label="Node groups" autoFocus={false} onClose={close}>
                {addGroups(catalog).map((g) => (
                  <SubmenuItem key={g.name} id={`group:${g.name}`} label={g.name} aria-label={`${g.name} nodes`} onAction={pick}>
                    {g.types.map((i) => (
                      <MenuItem key={i.type} id={i.type}>
                        <Row info={i} />
                      </MenuItem>
                    ))}
                  </SubmenuItem>
                ))}
              </Menu>
            )}
          </Autocomplete>
        </div>
      </Dialog>
    </EditorPopup>
  )
}
