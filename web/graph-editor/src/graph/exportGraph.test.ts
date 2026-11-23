import { describe, expect, it } from 'vitest'
import { exportFile } from './exportGraph'
import { parseClip, pasteSelection } from './doc'
import { blankDoc } from './save'
import { builtinLike, catalog, customLike } from './fixtures'

describe('exportFile', () => {
  it('names the file from the title, in the server id alphabet', () => {
    expect(exportFile(customLike(), 'My Cool Effect!').name).toBe('my-cool-effect.aurora-graph.json')
    expect(exportFile(customLike(), '').name).toBe('effect.aurora-graph.json')
  })

  it('re-imports to the same graph: nodes, wires, layout and controls', () => {
    for (const doc of [customLike(), builtinLike()]) {
      const positions = Object.fromEntries(doc.nodes.map((n, i) => [n.id, { x: i * 200, y: 40 }]))
      const clip = parseClip(exportFile(doc, 'x', positions).text)!
      expect(clip).not.toBeNull()
      const { doc: back, skipped } = pasteSelection(blankDoc(), clip, { x: 0, y: 0 }, catalog)
      expect(skipped).toEqual([])
      expect(back.nodes.map((n) => [n.type, n.params])).toEqual(doc.nodes.map((n) => [n.type, n.params]))
      const idOf = (list: typeof doc.nodes) => new Map(list.map((n, i) => [n.id, i]))
      const [a, b] = [idOf(doc.nodes), idOf(back.nodes)]
      const shape = (edges: typeof doc.edges, ids: Map<string, number>) =>
        edges.map(([from, to]) => [ids.get(from.split('.')[0]), from.split('.')[1], ids.get(to.split('.')[0]), to.split('.')[1]])
      expect(shape(back.edges, b)).toEqual(shape(doc.edges, a))
    }
  })

  it('keeps nodes that have no saved layout, using the canvas positions', () => {
    const doc = builtinLike()
    const clip = parseClip(exportFile(doc, 'x', { [doc.nodes[0].id]: { x: 7, y: 9 } }).text)!
    expect(clip.nodes).toHaveLength(doc.nodes.length)
    expect(clip.ui[doc.nodes[0].id]).toEqual({ x: 7, y: 9 })
  })
})
