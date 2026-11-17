import { useState } from 'react'
import { Drawer } from '@weblings/grille'
import { TUNING_KEY } from './GrabTab'
import { NameDialog } from './NameDialog'
import { PanelMenu, TuningPanel, type PanelMenuItem } from './TuningPanel'
import {
  addSection,
  controlIndex,
  controlsOf,
  deleteSection,
  moveControlInSection,
  moveControlToSection,
  renameSection,
  sectionNames,
  updateControl,
  withSections,
  type Control,
} from './graph/controls'
import { sectionSpec } from './graph/naming'
import { titleOf } from './graph/save'
import { effectiveLabel, moveSection, moveToNewSection } from './graph/tuningCards'
import type { Catalog, GraphDoc } from './graph/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  top: number
  side: 'right' | 'bottom'
  // Docked at full height: the grab tab sets it, the drawer only draws it.
  full: boolean
  doc: GraphDoc
  catalog: Catalog
  edit: (change: (d: GraphDoc) => GraphDoc) => void
  // Show on node, double-click and Enter: select the node, fit the view, ping the param.
  onShow: (node: string, param: string) => void
  onRemove: (node: string, param: string, name: string) => void
}

type Naming = { kind: 'add' } | { kind: 'rename'; name: string } | { kind: 'move'; control: Control }

// Tuning: the graph's controls as cards in sections, in the order the Dashboard shows them (Aurora-e4bi.3, .4).
export function ControlsDrawer({ isOpen, onClose, top, side, full, doc, catalog, edit, onShow, onRemove }: Props) {
  const controls = controlsOf(doc)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [naming, setNaming] = useState<Naming | null>(null)
  const names = sectionNames(controls, doc.ui)
  // The headings on screen: named sections, and General while it holds a control. A flat list has none.
  const shown = names.length === 0 ? [] : controls.some((c) => !c.section) ? [...names, ''] : names
  const describe = (c: Control) => {
    const n = doc.nodes.find((x) => x.id === c.node)
    const info = n ? catalog.get(n.type) : undefined
    return {
      nodeTitle: info?.title || n?.type || c.node,
      paramLabel: info?.params.find((p) => p.name === c.param)?.label || c.param,
    }
  }
  // Edits find the control again by node and param, since the doc may have moved on.
  const at = (d: GraphDoc, c: Control) => controlIndex(d, c.node, c.param)
  const section = (d: GraphDoc, change: (s: { controls: Control[]; ui: GraphDoc['ui'] }) => { controls: Control[]; ui: GraphDoc['ui'] }) =>
    withSections(d, change({ controls: controlsOf(d), ui: d.ui }))
  const menu: PanelMenuItem[] = [
    { id: 'add', label: 'Add section', run: () => setNaming({ kind: 'add' }) },
    { id: 'collapse', label: 'Collapse all', separatorBefore: true, disabled: shown.every((n) => collapsed.has(n)), run: () => setCollapsed(new Set(shown)) },
    { id: 'expand', label: 'Expand all', disabled: shown.every((n) => !collapsed.has(n)), run: () => setCollapsed(new Set()) },
    // The one-click close for a docked drawer (WCAG 2.5.7): dragging the tab down is not the only way.
    { id: 'hide', label: 'Hide Tuning', hint: TUNING_KEY, separatorBefore: true, run: onClose },
  ]
  const spec =
    naming?.kind === 'add'
      ? sectionSpec('add', names)
      : naming?.kind === 'rename'
        ? sectionSpec('rename', names, naming.name)
        : naming?.kind === 'move'
          ? sectionSpec('add', names, '', effectiveLabel(naming.control, describe(naming.control).paramLabel))
          : null
  const confirm = (name: string) => {
    if (naming?.kind === 'add') edit((d) => section(d, (s) => addSection(s, name)))
    else if (naming?.kind === 'rename') {
      const from = naming.name
      edit((d) => section(d, (s) => renameSection(s, from, name)))
      setCollapsed((c) => new Set([...c].map((n) => (n === from ? name : n))))
    } else if (naming?.kind === 'move') {
      const { node, param } = naming.control
      edit((d) => section(d, (s) => moveToNewSection(s, node, param, name)))
    }
    setNaming(null)
  }
  const onSectionAction = (name: string, action: 'rename' | 'up' | 'down' | 'delete') => {
    if (action === 'rename') setNaming({ kind: 'rename', name })
    else if (action === 'delete') {
      edit((d) => section(d, (s) => deleteSection(s, name)))
      setCollapsed((c) => new Set([...c].filter((n) => n !== name)))
    } else edit((d) => section(d, (s) => moveSection(s, name, action === 'up' ? -1 : 1)))
  }
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={controls.length > 0 ? `Tuning (${controls.length})` : 'Tuning'}
      top={top}
      side={side}
      hideControls
      expanded={full}
      actions={<PanelMenu items={menu} />}
    >
      <TuningPanel
        graphName={titleOf(doc) || 'this graph'}
        controls={controls}
        ui={doc.ui}
        describe={describe}
        dock={side === 'bottom'}
        onMove={(c, delta) => edit((d) => moveControlInSection(d, at(d, c), delta))}
        onMoveToSection={(c, section) =>
          edit((d) => {
            const i = at(d, c)
            return i < 0 ? d : withSections(d, moveControlToSection({ controls: controlsOf(d), ui: d.ui }, i, section))
          })
        }
        onShow={(c) => onShow(c.node, c.param)}
        onRemove={(c) => onRemove(c.node, c.param, effectiveLabel(c, describe(c).paramLabel))}
        onEdit={(c, label, tooltip) => edit((d) => updateControl(d, at(d, c), { label, tooltip }))}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        onSectionAction={onSectionAction}
        onMoveToNew={(c) => setNaming({ kind: 'move', control: c })}
      />
      {spec ? <NameDialog spec={spec} onConfirm={confirm} onCancel={() => setNaming(null)} /> : null}
    </Drawer>
  )
}
