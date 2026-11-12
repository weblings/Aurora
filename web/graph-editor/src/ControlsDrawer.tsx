import { Drawer, Icon, arrowDownIcon, arrowUpIcon, xMarkIcon } from '@weblings/grille'
import { controlsOf, moveControl, removeControl } from './graph/controls'
import type { Catalog, GraphDoc } from './graph/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  top: number
  side: 'right' | 'bottom'
  doc: GraphDoc
  catalog: Catalog
  edit: (change: (d: GraphDoc) => GraphDoc) => void
}

// The Dashboard's controls in order: reorder, remove, review. Label, section
// and tooltip are edited in Details, beside the tick (Aurora-daaa.27.3).
export function ControlsDrawer({ isOpen, onClose, top, side, doc, catalog, edit }: Props) {
  const controls = controlsOf(doc)
  const titleOf = (nodeId: string) => {
    const n = doc.nodes.find((x) => x.id === nodeId)
    return (n && catalog.get(n.type)?.title) || n?.type || nodeId
  }
  return (
    <Drawer isOpen={isOpen} onOpenChange={(open) => !open && onClose()} title={controls.length > 0 ? `Dashboard controls (${controls.length})` : 'Dashboard controls'} subtitle="Shown in this order." top={top} side={side}>
      {controls.length === 0 ? <p className="drawer-hint">None yet.</p> : null}
      <ol className="drawer-controls">
        {controls.map((c, i) => (
          <li key={`${c.node}.${c.param}`}>
            <div className="drawer-control-head">
              <span>
                {titleOf(c.node)} · {c.param}
              </span>
              <button type="button" className="btn btn-secondary" aria-label={`Move ${c.param} up`} disabled={i === 0} onClick={() => edit((d) => moveControl(d, i, -1))}>
                <Icon icon={arrowUpIcon} size="sm" />
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                aria-label={`Move ${c.param} down`}
                disabled={i === controls.length - 1}
                onClick={() => edit((d) => moveControl(d, i, 1))}
              >
                <Icon icon={arrowDownIcon} size="sm" />
              </button>
              <button type="button" className="btn btn-secondary" aria-label={`Remove ${c.param} from the Dashboard`} onClick={() => edit((d) => removeControl(d, i))}>
                <Icon icon={xMarkIcon} size="sm" />
              </button>
            </div>
            <div className="drawer-control-summary">
              {[c.label, c.section].filter((t) => typeof t === 'string' && t).join(' · ') || 'No label'}
            </div>
          </li>
        ))}
      </ol>
    </Drawer>
  )
}
