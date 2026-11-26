import { copySelection } from './doc'
import { slugify } from './save'
import type { GraphDoc, Position } from './types'

// Export graph (Aurora-vtm5): the whole graph as the clip JSON that paste accepts, so a file
// pasted or imported later gives the same graph. `positions` covers nodes with no saved layout.
export function exportFile(doc: GraphDoc, title: string, positions: Record<string, Position> = {}): { name: string; text: string } {
  const clip = copySelection(doc, new Set(doc.nodes.map((n) => n.id)), positions)
  return { name: `${slugify(title)}.aurora-graph.json`, text: JSON.stringify(clip, null, 2) }
}

// A Blob and an anchor with `download`: no permission prompt, works in every browser.
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
