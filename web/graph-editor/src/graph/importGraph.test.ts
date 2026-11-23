import { describe, expect, it } from 'vitest'
import { exportFile } from './exportGraph'
import { importFile, titleFromFileName } from './importGraph'
import { builtinLike, catalog, customLike } from './fixtures'

describe('titleFromFileName', () => {
  it('reads the export name back as a title', () => {
    expect(titleFromFileName('my-cool-effect.aurora-graph.json')).toBe('My cool effect')
    expect(titleFromFileName('Notes.JSON')).toBe('Notes')
    expect(titleFromFileName('.aurora-graph.json')).toBe('')
  })
})

describe('importFile', () => {
  it('turns an exported file back into the same graph, titled from the file name', () => {
    for (const doc of [customLike(), builtinLike()]) {
      const file = exportFile(doc, 'Round trip')
      const got = importFile(file.text, file.name, catalog, [])
      expect(got.ok).toBe(true)
      if (!got.ok) continue
      expect(got.doc.title).toBe('Round trip')
      expect(got.doc.nodes.map((n) => [n.type, n.params])).toEqual(doc.nodes.map((n) => [n.type, n.params]))
      expect(got.doc.edges).toHaveLength(doc.edges.length)
      expect(got.added).toBe(doc.nodes.length)
      expect(got.note).toBeNull()
    }
  })

  it('makes the title distinct from the effects already listed', () => {
    const file = exportFile(customLike(), 'Mine')
    const got = importFile(file.text, file.name, catalog, ['Mine'])
    expect(got.ok && got.doc.title).toBe('Mine (Copy)')
  })

  it('refuses text that is not a graph, with an error line', () => {
    expect(importFile('hello', 'a.json', catalog, [])).toEqual({ ok: false, error: 'Not an Aurora graph file' })
    expect(importFile('{"nodes":[]}', 'a.json', catalog, [])).toEqual({ ok: false, error: 'Not an Aurora graph file' })
  })

  it('refuses a graph whose nodes are all unknown here', () => {
    const clip = JSON.stringify({ 'aurora-graph-clip': 1, nodes: [{ id: 'x', type: 'no.such', params: {} }], edges: [], ui: {}, controls: [] })
    const got = importFile(clip, 'a.json', catalog, [])
    expect(got).toEqual({ ok: false, error: 'Nothing to import: unknown type here' })
  })
})
