import { useRef, useState } from 'react'
import { Dialog } from '@weblings/grille'
import { EditorPopup } from './EditorPopup'
import type { Problems } from './graph/problems'

export function problemCount(problems: Problems): number {
  let n = problems.graph.length
  for (const p of problems.nodes.values()) n += p.messages.length
  return n
}

// The one place the graph's problems are counted: node-level and graph-wide.
// A node row selects the node; a "Whole graph" row has no node to point at, so
// it carries its own action.
export function ProblemsChip({
  problems,
  onSelectNode,
  onAddNode,
}: {
  problems: Problems
  onSelectNode: (id: string) => void
  onAddNode: () => void
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const count = problemCount(problems)
  if (count === 0) return null
  const close = () => setOpen(false)
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="btn btn-secondary editor-problems-chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⚠ {count} {count === 1 ? 'problem' : 'problems'}
      </button>
      <EditorPopup isOpen={open} onClose={close} label="Problems" triggerRef={trigger}>
        <Dialog aria-label="Problems">
          <ul className="editor-problem-list">
            {[...problems.nodes].flatMap(([id, p]) =>
              p.messages.map((m) => (
                <li key={`${id}:${m}`}>
                  <button
                    type="button"
                    className="editor-problem-row"
                    onClick={() => {
                      close()
                      onSelectNode(id)
                    }}
                  >
                    <strong>{id}</strong> {m}
                  </button>
                </li>
              )),
            )}
            {problems.graph.map((m) => (
              <li key={`graph:${m}`} className="editor-problem-row">
                <span>
                  <strong>Whole graph</strong> {m}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    close()
                    onAddNode()
                  }}
                >
                  Add node…
                </button>
              </li>
            ))}
          </ul>
        </Dialog>
      </EditorPopup>
    </>
  )
}
