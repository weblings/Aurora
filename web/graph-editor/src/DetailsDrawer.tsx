import { useEffect, useRef } from 'react'
import { Drawer } from '@weblings/grille'
import { CommitInput } from './CommitInput'
import { addControl, controlIndex, controlsOf, removeControl, updateControl, type ControlText } from './graph/controls'
import type { Catalog, GraphDoc } from './graph/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  top: number
  side: 'right' | 'bottom'
  doc: GraphDoc
  catalog: Catalog
  // The node picked on the canvas, if exactly one. The drawer follows it.
  selected: string | null
  // Changes each time "Show on the Dashboard" asks for the checkboxes.
  focusChecks: number
  edit: (change: (d: GraphDoc) => GraphDoc) => void
}

// What the picked node is, and which of its params the Dashboard shows, with
// each shown control's text beside its tick (Aurora-daaa.27.3).
export function DetailsDrawer({ isOpen, onClose, top, side, doc, catalog, selected, focusChecks, edit }: Props) {
  const node = selected ? doc.nodes.find((n) => n.id === selected) : undefined
  const info = node ? catalog.get(node.type) : undefined
  const checks = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen || focusChecks === 0) return
    const first = checks.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')
    first?.scrollIntoView({ block: 'nearest' })
    first?.focus()
  }, [isOpen, focusChecks, selected])

  const controls = controlsOf(doc)
  return (
    <Drawer isOpen={isOpen} onOpenChange={(open) => !open && onClose()} title={node && info ? info.title || node.type : 'Details'} subtitle={node ? node.id : undefined} top={top} side={side}>
      {node && info ? (
        <div className="drawer-details">
          <p>{info.purpose}</p>
          {info.inputs.length + info.outputs.length > 0 ? (
            <ul className="drawer-ports">
              {info.inputs.map((p) => (
                <li key={`in-${p.name}`}>
                  <strong>{p.name}</strong> in, {p.type}
                  {p.description ? `: ${p.description}` : ''}
                </li>
              ))}
              {info.outputs.map((p) => (
                <li key={`out-${p.name}`}>
                  <strong>{p.name}</strong> out, {p.type}
                  {p.description ? `: ${p.description}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
          {info.params.length > 0 ? (
            <div ref={checks}>
              <h3>Show on the Dashboard</h3>
              {info.params.map((param) => {
                const at = controlIndex(doc, node.id, param.name)
                const control = at >= 0 ? controls[at] : undefined
                return (
                  <div key={param.name}>
                    <label className="drawer-check">
                      <input
                        type="checkbox"
                        checked={at >= 0}
                        onChange={() =>
                          edit((d) => {
                            const i = controlIndex(d, node.id, param.name)
                            return i >= 0 ? removeControl(d, i) : addControl(d, node.id, param.name, info)
                          })
                        }
                      />
                      {param.label || param.name}
                    </label>
                    {control ? (
                      <div className="drawer-control-text">
                        {(['label', 'section', 'tooltip'] as const).map((field) => (
                          <CommitInput
                            key={field}
                            label={field[0].toUpperCase() + field.slice(1)}
                            value={typeof control[field] === 'string' ? (control[field] as string) : ''}
                            onCommit={(v) =>
                              edit((d) => {
                                const i = controlIndex(d, node.id, param.name)
                                return i < 0 ? d : updateControl(d, i, { [field]: v } as ControlText)
                              })
                            }
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="drawer-hint">Pick a node to see what it does and choose which of its params the Dashboard shows.</p>
      )}
    </Drawer>
  )
}
