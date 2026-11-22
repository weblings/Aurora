import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button as AriaButton, Collection, Tree, TreeItem, TreeItemContent, useDragAndDrop, type DropTarget } from 'react-aria-components'
import { Dialog, Icon, Menu, MenuItem, MenuSeparator, SubmenuItem, Tooltip, TreeDragHandle, TreeDropIndicator, chevronDownIcon, menuHorizontalIcon } from '@weblings_things/grille'
import { deriveSections } from '../../ui/TuningControls.js'
import { EditorPopup } from './EditorPopup'
import { Keyed } from './EditMenu'
import { NameDialog } from './NameDialog'
import type { Control, SectionState } from './graph/controls'
import { GENERAL, cardMenu, dropControl, dropSection, effectiveLabel, sectionMenu, sectionTitle, sourceLine } from './graph/tuningCards'
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
  // Section names (General is '') the user collapsed: local to the panel, never saved in the graph.
  collapsed: ReadonlySet<string>
  onCollapsedChange: (next: Set<string>) => void
  onSectionAction: (name: string, action: 'rename' | 'up' | 'down' | 'delete') => void
  onMoveToNew: (c: Control) => void
  // A drag and drop: the caller applies the change to the graph as one edit.
  onReorder: (change: (s: SectionState) => SectionState) => void
}

type Row = { key: string; heading?: { name: string; count: number }; card?: Control; children?: Row[] }

export type PanelMenuItem = { id: string; label: string; disabled?: boolean; separatorBefore?: boolean; hint?: string; run: () => void }

// The panel's `...` menu in the drawer head. A list, so later items (Hide Tuning, Aurora-e4bi.12) just append.
export function PanelMenu({ items }: { items: PanelMenuItem[] }) {
  return (
    <RowMenu label="Tuning actions">
      {(close) => (
        <Menu
          aria-label="Tuning actions"
          onClose={close}
          onAction={(id) => {
            close()
            items.find((i) => i.id === id)?.run()
          }}
        >
          {items.flatMap((i) => [
            ...(i.separatorBefore ? [<MenuSeparator key={`${i.id}-sep`} />] : []),
            <MenuItem key={i.id} id={i.id} isDisabled={i.disabled}>
              {i.hint ? <Keyed hint={i.hint}>{i.label}</Keyed> : i.label}
            </MenuItem>,
          ])}
        </Menu>
      )}
    </RowMenu>
  )
}

const sectionKey = (name: string) => `s:${name}`
const keyOf = (c: Control) => `c:${c.node}.${c.param}`

// A borderless `...` button with its menu: Grille has no borderless button.
export function RowMenu({
  label,
  onOpen,
  children,
}: {
  label: string
  onOpen?: (open: boolean) => void
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => onOpen?.(open), [open, onOpen])
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

// An empty section has no child rows, so React Aria never reports it expanded: `open` comes from our own state.
function SectionRow({ name, count, panel }: { name: string; count: number; panel: TuningPanelProps }) {
  const open = !panel.collapsed.has(name)
  const general = name === GENERAL
  const m = sectionMenu(panel.controls, panel.ui, name)
  const title = sectionTitle(name)
  return (
    <div className="cp-sec">
      <div className="cp-pill" data-open={open || undefined}>
        {general ? null : <TreeDragHandle aria-label={`Drag the ${name} section`} />}
        <span className="cp-sec-name">{title}</span>
        <span className="cp-count">{count}</span>
        {general ? null : (
          <RowMenu label={`${name} section actions`}>
            {(close) => (
              <Menu
                aria-label={`${name} section actions`}
                onClose={close}
                onAction={(id) => {
                  close()
                  panel.onSectionAction(name, String(id) as 'rename' | 'up' | 'down' | 'delete')
                }}
              >
                <MenuItem id="rename">Rename</MenuItem>
                <MenuItem id="up" isDisabled={!m.canUp}>
                  Move up
                </MenuItem>
                <MenuItem id="down" isDisabled={!m.canDown}>
                  Move down
                </MenuItem>
                <MenuSeparator />
                <MenuItem id="delete">Delete</MenuItem>
              </Menu>
            )}
          </RowMenu>
        )}
        <AriaButton
          slot={count > 0 ? 'chevron' : undefined}
          onPress={
            count > 0
              ? undefined
              : () => panel.onCollapsedChange(new Set(open ? [...panel.collapsed, name] : [...panel.collapsed].filter((n) => n !== name)))
          }
          className="ui-button cp-chev"
          data-variant="ghost"
          data-icon
          data-size="sm"
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
        >
          <Icon icon={chevronDownIcon} size="sm" />
        </AriaButton>
      </div>
      {open && count === 0 ? <p className="cp-empty">Empty. Use a control's Move to section.</p> : null}
    </div>
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
      <TreeDragHandle aria-label={`Drag ${name}`} />
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
              <SubmenuItem id="to" label="Move to section" aria-label="Move to section" onAction={pick}>
                {menu.sections.map((s) => (
                  <MenuItem key={s} id={`to:${s}`}>
                    {sectionTitle(s)}
                  </MenuItem>
                ))}
                {menu.sections.length > 0 ? <MenuSeparator /> : null}
                <MenuItem id="to-new">New section…</MenuItem>
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
        key: sectionKey(g.section),
        heading: { name: g.section, count: g.controls.length },
        children: g.controls.map((c) => ({ key: keyOf(c), card: c })),
      }))
  const expanded = new Set(groups.filter((g) => !panel.collapsed.has(g.section)).map((g) => sectionKey(g.section)))
  const state: SectionState = { controls, ui }
  const byKey = (k: string) => controls.find((c) => keyOf(c) === k)
  const dragging = useRef<string | null>(null)
  const saved = useRef<ReadonlySet<string> | null>(null)
  // A section drag folds every section, so only the gaps between headings are targets.
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((k) => ({ 'text/plain': String(k) })),
    onDragStart: (e) => {
      const k = String([...e.keys][0])
      dragging.current = k
      if (k.startsWith('s:')) {
        saved.current = panel.collapsed
        panel.onCollapsedChange(new Set(groups.map((g) => g.section)))
      }
    },
    onDragEnd: () => {
      dragging.current = null
      if (saved.current) panel.onCollapsedChange(new Set(saved.current))
      saved.current = null
    },
    getDropOperation: (target: DropTarget) => {
      const k = dragging.current
      if (target.type === 'root' || !k) return 'cancel'
      const t = String(target.key)
      if (k.startsWith('s:')) {
        if (!t.startsWith('s:')) return 'cancel'
        return dropSection(state, k.slice(2), t.slice(2), target.dropPosition) === state ? 'cancel' : 'move'
      }
      if (t.startsWith('s:')) return target.dropPosition === 'on' ? 'move' : 'cancel'
      return target.dropPosition === 'on' || t === k ? 'cancel' : 'move'
    },
    onMove: (e) => {
      const k = String([...e.keys][0])
      const t = String(e.target.key)
      const pos = e.target.dropPosition
      if (k.startsWith('s:')) panel.onReorder((s) => dropSection(s, k.slice(2), t.slice(2), pos))
      else {
        const from = byKey(k)
        const card = byKey(t)
        const to = t.startsWith('s:') ? { heading: t.slice(2) } : card && { card }
        if (from && to) panel.onReorder((s) => dropControl(s, from, to, pos))
      }
    },
    renderDropIndicator: (target) => (
      <TreeDropIndicator target={target} child={!flat && target.type === 'item' && String(target.key).startsWith('c:')} />
    ),
  })
  const nameOf = (c: Control) => effectiveLabel(c, describe(c).paramLabel)

  const act = (c: Control, id: string) => {
    if (id === 'edit') setEditing(c)
    else if (id === 'up') panel.onMove(c, -1)
    else if (id === 'down') panel.onMove(c, 1)
    else if (id === 'to-new') panel.onMoveToNew(c)
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
              <SectionRow name={r.heading!.name} count={r.heading!.count} panel={panel} />
            )
          }
        </TreeItemContent>
        {r.children ? <Collection items={r.children}>{renderRow}</Collection> : null}
      </TreeItem>
    )
  }

  if (groups.length === 0) return <p className="drawer-hint">None yet. Right-click a param on a node and choose Add to Tuning.</p>
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
      <Tree aria-label={`Tuning, ${panel.graphName}`} className="cp-tree" items={rows} dragAndDropHooks={dragAndDropHooks}
        expandedKeys={expanded}
        onExpandedChange={(keys) => panel.onCollapsedChange(new Set(groups.filter((g) => !keys.has(sectionKey(g.section))).map((g) => g.section)))}
      >
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
