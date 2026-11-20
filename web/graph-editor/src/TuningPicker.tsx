import { useEffect, useRef } from 'react'
import { Dialog } from '@weblings/grille'
import { EditorPopup } from './EditorPopup'
import { controlIndex } from './graph/controls'
import type { GraphDoc, NodeTypeInfo } from './graph/types'

const PICK_W = 236 // picker width plus the popover's gap

// Beside the node so it does not read as part of it, by measured room (React Aria does not flip "right" when
// neither side fits); below the header only when neither side has room.
export function pickPlacement(node: Element | null): 'right top' | 'left top' | 'bottom start' {
  const r = node?.getBoundingClientRect()
  if (!r) return 'bottom start'
  if (r.right + PICK_W <= innerWidth - 8 && r.right >= 0) return 'right top'
  if (r.left - PICK_W >= 8 && r.left <= innerWidth) return 'left top'
  return 'bottom start'
}

// "Tuning controls…": the node's params with a switch each. Non-modal, and stays open while several are switched.
export function TuningPicker({
  node,
  info,
  doc,
  drawerOpen,
  onToggle,
  onOpenTuning,
  onClose,
}: {
  node: string
  info: NodeTypeInfo
  doc: GraphDoc
  drawerOpen: boolean
  onToggle: (param: string, label: string, on: boolean) => void
  onOpenTuning: () => void
  onClose: () => void
}) {
  const header = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(node)}"] .aurora-node-header`)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    // preventScroll: before placement settles the popover can sit past the window edge, and a focus scroll there
    // closes it.
    const t = window.setTimeout(() => first.current?.focus({ preventScroll: true }), 0)
    return () => window.clearTimeout(t)
  }, [])
  // Always a point, clamped into the window: a node wider than the window would push a header-anchored popover out.
  const placement = pickPlacement(header)
  const box = header?.getBoundingClientRect()
  const x = !box ? 8 : placement === 'right top' ? box.right + 8 : placement === 'left top' ? box.left - 8 : Math.max(8, Math.min(box.left, innerWidth - PICK_W - 16))
  const point = { x, y: !box ? 60 : placement === 'bottom start' ? box.bottom : box.top }
  return (
    <EditorPopup isOpen onClose={onClose} label="Tuning controls" point={point} placement={placement} key={node}>
      <Dialog aria-label={`${info.title || node} Tuning controls`}>
        <div className="tuning-pick" data-placement={placement} data-point={`${Math.round(point.x)},${Math.round(point.y)}`}>
          <div className="tuning-pick-title">Tuning controls</div>
          {info.params.map((param, i) => {
            const label = param.label || param.name
            const on = controlIndex(doc, node, param.name) >= 0
            return (
              <label key={param.name} className="tuning-pick-row">
                <span>{label}</span>
                <span className="toggle-switch">
                  <input
                    ref={i === 0 ? first : undefined}
                    type="checkbox"
                    checked={on}
                    aria-label={`Add ${label} to Tuning`}
                    onChange={() => onToggle(param.name, label, on)}
                  />
                  <span className="toggle-knob" />
                </span>
              </label>
            )
          })}
          {drawerOpen ? null : (
            <button type="button" className="tuning-pick-open" onClick={onOpenTuning}>
              Open Tuning
            </button>
          )}
        </div>
      </Dialog>
    </EditorPopup>
  )
}
