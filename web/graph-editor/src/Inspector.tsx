import { useEffect, useState } from 'react'
import { addControl, controlIndex, controlsOf, moveControl, removeControl, updateControl, type ControlText } from './graph/controls'
import type { Catalog, GraphDoc } from './graph/types'

type Props = {
  doc: GraphDoc
  catalog: Catalog
  // The node picked on the canvas, if exactly one.
  selected: string | null
  edit: (change: (d: GraphDoc) => GraphDoc) => void
}

// A text box that applies its value when it loses focus or Enter is pressed,
// so typing a label is one undo step, not one per key.
function CommitInput({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const apply = () => text !== value && onCommit(text)
  return (
    <label className="inspector-field">
      <span>{label}</span>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  )
}

// Right-hand panel: what the picked node is, which of its params the Dashboard
// shows, and the Dashboard's controls in order with their text.
export function Inspector({ doc, catalog, selected, edit }: Props) {
  const node = selected ? doc.nodes.find((n) => n.id === selected) : undefined
  const info = node ? catalog.get(node.type) : undefined
  const controls = controlsOf(doc)
  const titleOf = (nodeId: string) => {
    const n = doc.nodes.find((x) => x.id === nodeId)
    return (n && catalog.get(n.type)?.title) || n?.type || nodeId
  }

  return (
    <aside className="inspector" aria-label="Inspector">
      {node && info ? (
        <section>
          <h3>
            {info.title || node.type} <small>{node.id}</small>
          </h3>
          <p>{info.purpose}</p>
          {info.inputs.length + info.outputs.length > 0 ? (
            <ul className="inspector-ports">
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
            <>
              <h4>Show on the Dashboard</h4>
              {info.params.map((param) => {
                const on = controlIndex(doc, node.id, param.name) >= 0
                return (
                  <label className="inspector-check" key={param.name} title={param.description}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        edit((d) => {
                          const at = controlIndex(d, node.id, param.name)
                          return at >= 0 ? removeControl(d, at) : addControl(d, node.id, param.name, info)
                        })
                      }
                    />
                    {param.label || param.name}
                  </label>
                )
              })}
            </>
          ) : null}
        </section>
      ) : (
        <p className="inspector-hint">Pick a node to see what it does and choose which of its params the Dashboard shows.</p>
      )}
      <section>
        <h3>Dashboard controls ({controls.length})</h3>
        {controls.length === 0 ? <p className="inspector-hint">None: Tuning shows nothing for this effect.</p> : null}
        <ol className="inspector-controls">
          {controls.map((c, i) => (
            <li key={`${c.node}.${c.param}`}>
              <div className="inspector-control-head">
                <span title={`${c.node}.${c.param}`}>
                  {titleOf(c.node)} · {c.param}
                </span>
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => edit((d) => moveControl(d, i, -1))}>
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={i === controls.length - 1}
                  onClick={() => edit((d) => moveControl(d, i, 1))}
                >
                  ↓
                </button>
                <button type="button" aria-label="Remove from the Dashboard" onClick={() => edit((d) => removeControl(d, i))}>
                  ✕
                </button>
              </div>
              {(['label', 'section', 'tooltip'] as const).map((field) => (
                <CommitInput
                  key={field}
                  label={field[0].toUpperCase() + field.slice(1)}
                  value={typeof c[field] === 'string' ? (c[field] as string) : ''}
                  onCommit={(v) => edit((d) => updateControl(d, i, { [field]: v } as ControlText))}
                />
              ))}
            </li>
          ))}
        </ol>
      </section>
    </aside>
  )
}
