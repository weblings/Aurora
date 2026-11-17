import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button as AriaButton, Collection, Tree, TreeItem, TreeItemContent } from 'react-aria-components'
import { Dialog, Icon, Menu, MenuItem, MenuSeparator, SubmenuItem, Tooltip, menuHorizontalIcon } from '@weblings/grille'
import { deriveSections } from '../../ui/TuningControls.js'
import { EditorPopup } from './EditorPopup'
import { NameDialog } from './NameDialog'
import type { Control } from './graph/controls'
import { GENERAL, cardMenu, effectiveLabel, sectionTitle, sourceLine } from './graph/tuningCards'
import type { GraphUi } from './graph/types'

// The Tuning card list (Aurora-e4bi.3), ported from the e4bi.1 mock. It takes one graph level's controls and the
// graph's name, not the whole doc, so a sub-graph can show its own later. Section headings are read-only here.
export type TuningPanelProps = {
  graphName: string
  controls: Control[]
  ui: GraphUi | undefined
  // The node's title and the param's own label for a control, from the catalog.
  describe: (c: Control) => { nodeTitle: string; paramLabel: string }
  dock: boolean
  onMove: (c: Control, delta: -1 | 1) => void
  onMoveToSection: (c: Control, section: string) => void
  onShow: (c: Control) => void
  onRemove: (c: Control) => void
  onEdit: (c: Control, label: string, tooltip: string) => void
}

type Row = { key: string; heading?: { name: string; count: number }; card?: Control; children?: Row[] }

const keyOf = (c: Control) => `c:${c.node}.${c.param}`

// A borderless `...` button with its menu: Grille has no borderless button.
function RowMenu({ label, onOpen, children }: { label: string; onOpen: (open: boolean) => void; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => onOpen(open), [open, onOpen])
  const ref = useRef<HTMLButtonElement>(null)
  const close = () => setOpen(false)
  return (
    <>
      <AriaButton
        ref={ref}
        className="ui-button"
        data-variant="ghost"
        data-icon
        data-size="sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onPress={() => setOpen((o) => !o)}
      >
        <Icon icon={menuHorizontalIcon} size="sm" />
      </AriaButton>
      <EditorPopup isOpen={open} onClose={close} label={label} triggerRef={ref} placement="bottom end">
        <Dialog aria-label={label}>{children(close)}</Dialog>
      </EditorPopup>
    </>
  )
}

function Card({
  c,
  panel,
  focused,
  menu,
  name,
  source,
  actions,
}: {
  c: Control
  panel: TuningPanelProps
  focused: boolean
  menu: ReturnType<typeof cardMenu>
  name: string
  source: string
  actions: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const { nodeTitle, paramLabel } = panel.describe(c)
  // One handler for both menu levels, guarded, since a submenu pick may reach both onActions.
  const done = useRef(false)
  const tipOpen = (hover || focused) && !menuOpen
  return (
    <div
      ref={ref}
      className="cp-card"
      onPointerEnter={() => {
        timer.current = window.setTimeout(() => setHover(true), 500)
      }}
      onPointerLeave={() => {
        window.clearTimeout(timer.current)
        setHover(false)
      }}
    >
      <span className="cp-label">{name}</span>
      <RowMenu label={`${name} (${nodeTitle}, ${paramLabel}) actions`} onOpen={setMenuOpen}>
        {(close) => {
          done.current = false
          const pick = (id: string) => {
            if (done.current) return
            done.current = true
            close()
            actions(id)
          }
          return (
            <Menu aria-label={`${name} actions`} onClose={close} onAction={(id) => id !== 'to' && pick(String(id))}>
              <MenuItem id="edit">Edit…</MenuItem>
              <MenuItem id="up" isDisabled={!menu.canUp}>
                Move up
              </MenuItem>
              <MenuItem id="down" isDisabled={!menu.canDown}>
                Move down
              </MenuItem>
              <SubmenuItem id="to" label="Move to section" aria-label="Move to section" isDisabled={menu.sections.length === 0} onAction={pick}>
                {menu.sections.map((s) => (
                  <MenuItem key={s} id={`to:${s}`}>
                    {sectionTitle(s)}
                  </MenuItem>
                ))}
              </SubmenuItem>
              <MenuSeparator />
              <MenuItem id="show">Show on node</MenuItem>
              <MenuSeparator />
              <MenuItem id="remove">Remove</MenuItem>
            </Menu>
          )
        }}
      </RowMenu>
      <Tooltip triggerRef={ref} isOpen={tipOpen} placement={panel.dock ? 'top' : 'left'}>
        <div>{name}</div>
        <div className="cp-tip-sub">{source}</div>
        {c.tooltip ? <div className="cp-tip-note">Tooltip: {c.tooltip}</div> : null}
      </Tooltip>
    </div>
  )
}

export function TuningPanel(panel: TuningPanelProps) {
  const { controls, ui, describe, onShow } = panel
  const [editing, setEditing] = useState<Control | null>(null)
  const groups = useMemo(() => deriveSections(controls, ui) as { section: string; controls: Control[] }[], [controls, ui])
  const flat = groups.every((g) => g.section === GENERAL)
  const rows: Row[] = flat
    ? controls.map((c) => ({ key: keyOf(c), card: c }))
    : groups.map((g) => ({
        key: `s:${g.section}`,
        heading: { name: g.section, count: g.controls.length },
        children: g.controls.map((c) => ({ key: keyOf(c), card: c })),
      }))
  const expanded = new Set(groups.map((g) => `s:${g.section}`))
  const nameOf = (c: Control) => effectiveLabel(c, describe(c).paramLabel)

  const act = (c: Control, id: string) => {
    if (id === 'edit') setEditing(c)
    else if (id === 'up') panel.onMove(c, -1)
    else if (id === 'down') panel.onMove(c, 1)
    else if (id.startsWith('to:')) panel.onMoveToSection(c, id.slice(3))
    else if (id === 'show') onShow(c)
    else if (id === 'remove') panel.onRemove(c)
  }

  const renderRow = (r: Row): ReactNode => {
    const c = r.card
    const d = c ? describe(c) : null
    return (
      <TreeItem
        key={r.key}
        id={r.key}
        textValue={c && d ? `${nameOf(c)}, ${d.nodeTitle}, ${d.paramLabel}` : sectionTitle(r.heading!.name)}
        hasChildItems={r.children ? true : undefined}
        className={c ? 'cp-item cp-item-card' : 'cp-item cp-item-sec'}
        onDoubleClick={c ? () => onShow(c) : undefined}
      >
        <TreeItemContent>
          {(rp) =>
            c && d ? (
              <Card
                c={c}
                panel={panel}
                focused={rp.isFocusVisible}
                menu={cardMenu(controls, ui, c)}
                name={nameOf(c)}
                source={sourceLine(c, d.nodeTitle, d.paramLabel)}
                actions={(id) => act(c, id)}
              />
            ) : (
              <div className="cp-sec">
                <div className="cp-pill">
                  <span className="cp-sec-name">{sectionTitle(r.heading!.name)}</span>
                  <span className="cp-count">{r.heading!.count}</span>
                </div>
              </div>
            )
          }
        </TreeItemContent>
        {r.children ? <Collection items={r.children}>{renderRow}</Collection> : null}
      </TreeItem>
    )
  }

  if (controls.length === 0) return <p className="drawer-hint">None yet. Right-click a param on a node and choose Add to Tuning.</p>
  return (
    <div
      // React Aria's row keys run in the capture phase, so Enter on a focused card row is caught here.
      onKeyDown={(e) => {
        const row = e.target as HTMLElement
        if (e.key !== 'Enter' || row.getAttribute('role') !== 'row' || !row.dataset.key?.startsWith('c:')) return
        const hit = controls.find((c) => keyOf(c) === row.dataset.key)
        if (hit) onShow(hit)
      }}
    >
      <Tree aria-label={`Tuning, ${panel.graphName}`} className="cp-tree" items={rows} expandedKeys={expanded}>
        {renderRow}
      </Tree>
      {editing ? (
        <NameDialog
          control={{
            paramLabel: describe(editing).paramLabel,
            label: editing.label ?? '',
            tooltip: editing.tooltip ?? '',
            others: controls.filter((c) => c !== editing).map(nameOf),
          }}
          onSave={(label, tooltip) => {
            panel.onEdit(editing, label, tooltip)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}
