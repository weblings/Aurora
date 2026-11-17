import { Drawer } from '@weblings/grille'
import { TuningPanel } from './TuningPanel'
import { controlIndex, controlsOf, moveControlInSection, moveControlToSection, updateControl, withSections, type Control } from './graph/controls'
import { titleOf } from './graph/save'
import { effectiveLabel } from './graph/tuningCards'
import type { Catalog, GraphDoc } from './graph/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  top: number
  side: 'right' | 'bottom'
  doc: GraphDoc
  catalog: Catalog
  edit: (change: (d: GraphDoc) => GraphDoc) => void
  // Show on node, double-click and Enter: select the node, fit the view, ping the param.
  onShow: (node: string, param: string) => void
  onRemove: (node: string, param: string, name: string) => void
}

// Tuning: the graph's controls as cards, in the order the Dashboard shows them (Aurora-e4bi.3).
export function ControlsDrawer({ isOpen, onClose, top, side, doc, catalog, edit, onShow, onRemove }: Props) {
  const controls = controlsOf(doc)
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
  return (
    <Drawer isOpen={isOpen} onOpenChange={(open) => !open && onClose()} title={controls.length > 0 ? `Tuning (${controls.length})` : 'Tuning'} top={top} side={side}>
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
      />
    </Drawer>
  )
}
