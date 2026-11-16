import { describe, expect, it } from 'vitest'
import { CLIP_MARK, copySelection, parseClip, pasteNote, pasteSelection } from './doc'
import { builtinLike, catalog, customLike } from './fixtures'
import type { GraphDoc } from './types'

const doc = (): GraphDoc => ({
  ...customLike(),
  ui: { cap: { x: 100, y: 50 }, rescale: { x: 300, y: 80 }, send: { x: 600, y: 50 } },
  controls: [{ node: 'rescale', param: 'width', label: 'Width' }, { node: 'send', param: 'output' }],
  nodes: [
    { id: 'cap', type: 'video.capture', params: {} },
    { id: 'rescale', type: 'image.rescale', params: { width: 64 } },
    { id: 'send', type: 'output.send', params: { output: 'hue' } },
  ],
  edges: [['cap.image', 'rescale.image'], ['rescale.image', 'send.frame']],
})

describe('copySelection', () => {
  it('keeps the nodes, only the wires inside the selection, their layout and controls', () => {
    const clip = copySelection(doc(), new Set(['cap', 'rescale']))
    expect(clip.nodes.map((n) => n.id)).toEqual(['cap', 'rescale'])
    expect(clip.edges).toEqual([['cap.image', 'rescale.image']])
    expect(clip.ui).toEqual({ cap: { x: 100, y: 50 }, rescale: { x: 300, y: 80 } })
    expect(clip.controls).toEqual([{ node: 'rescale', param: 'width', label: 'Width' }])
  })

  it('takes positions for nodes with no saved layout, and leaves the document alone', () => {
    const d = builtinLike()
    const before = JSON.stringify(d)
    const clip = copySelection(d, new Set([d.nodes[0].id]), { [d.nodes[0].id]: { x: 7, y: 9 } })
    expect(clip.ui[d.nodes[0].id]).toEqual({ x: 7, y: 9 })
    expect(JSON.stringify(d)).toBe(before)
  })

  it('round-trips through the marked JSON', () => {
    const clip = copySelection(doc(), new Set(['cap']))
    expect(parseClip(JSON.stringify(clip))).toEqual(clip)
  })
})

describe('parseClip', () => {
  it('rejects text that is not a clip', () => {
    for (const text of ['', 'hello', '{}', '[]', '{"nodes":[]}', `{"${CLIP_MARK}":2,"nodes":[]}`, `{"${CLIP_MARK}":1}`]) {
      expect(parseClip(text)).toBeNull()
    }
  })

  it('drops damaged entries', () => {
    const text = JSON.stringify({ [CLIP_MARK]: 1, nodes: [{ id: 'a', type: 'video.capture' }, { id: 3 }, null], edges: [['a.x'], ['a.x', 'b.y']] })
    const clip = parseClip(text)!
    expect(clip.nodes).toHaveLength(1)
    expect(clip.edges).toEqual([['a.x', 'b.y']])
  })
})

describe('pasteSelection', () => {
  it('adds copies with fresh ids, remapped wires and controls, the top-left corner at the point', () => {
    const d = doc()
    const clip = copySelection(d, new Set(['cap', 'rescale']))
    const r = pasteSelection(d, clip, { x: 1000, y: 400 }, catalog)
    expect(r.skipped).toEqual([])
    expect(r.added.get('cap')).toBe('capture')
    expect(r.added.get('rescale')).toBe('rescale-2')
    expect(r.doc.nodes).toHaveLength(5)
    expect(r.doc.edges).toContainEqual(['capture.image', 'rescale-2.image'])
    expect(r.doc.ui!['capture']).toEqual({ x: 1000, y: 400 })
    expect(r.doc.ui!['rescale-2']).toEqual({ x: 1200, y: 430 })
    expect(r.doc.controls).toContainEqual({ node: 'rescale-2', param: 'width', label: 'Width' })
    expect(d.nodes).toHaveLength(3)
  })

  it('does not share params with the clip', () => {
    const d = doc()
    const clip = copySelection(d, new Set(['rescale']))
    const r = pasteSelection(d, clip, { x: 0, y: 0 }, catalog)
    const copy = r.doc.nodes.find((n) => n.id === 'rescale-2')!
    copy.params!.width = 1
    expect(clip.nodes[0].params!.width).toBe(64)
  })

  it('skips a singleton the graph already has, with its wires and controls', () => {
    const d = doc()
    const clip = copySelection(d, new Set(['rescale', 'send']))
    const r = pasteSelection(d, clip, { x: 0, y: 0 }, catalog)
    expect(r.skipped).toEqual([{ id: 'send', type: 'output.send', reason: 'single' }])
    expect(r.doc.nodes).toHaveLength(4)
    expect(r.doc.edges).toHaveLength(2)
    expect(r.doc.controls).toHaveLength(3)
  })

  it('pastes a singleton once the original is gone (a cut)', () => {
    const d = doc()
    const clip = copySelection(d, new Set(['send']))
    const r = pasteSelection(d, clip, { x: 0, y: 0 }, catalog)
    expect(r.skipped).toHaveLength(1)
    const cut = { ...d, nodes: d.nodes.filter((n) => n.id !== 'send'), edges: [] as GraphDoc['edges'] }
    expect(pasteSelection(cut, clip, { x: 0, y: 0 }, catalog).added.get('send')).toBe('send')
  })

  it('skips types the catalog does not know and returns the same document when nothing lands', () => {
    const d = doc()
    const clip = parseClip(JSON.stringify({ [CLIP_MARK]: 1, nodes: [{ id: 'x', type: 'future.thing' }] }))!
    const r = pasteSelection(d, clip, { x: 0, y: 0 }, catalog)
    expect(r.skipped).toEqual([{ id: 'x', type: 'future.thing', reason: 'unknown' }])
    expect(r.doc).toBe(d)
  })

  it('pastes twice without id clashes', () => {
    const d = doc()
    const clip = copySelection(d, new Set(['cap', 'rescale']))
    const once = pasteSelection(d, clip, { x: 0, y: 0 }, catalog).doc
    const twice = pasteSelection(once, clip, { x: 24, y: 24 }, catalog).doc
    const ids = twice.nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('pasteNote', () => {
  const single = (type: string) => ({ id: type, type, reason: 'single' as const })
  it('says nothing when everything landed', () => {
    expect(pasteNote(3, [], catalog)).toBeNull()
  })
  it('names the one singleton, or says each', () => {
    expect(pasteNote(4, [single('output.send')], catalog)).toBe('Pasted 4 nodes, skipped 1 (Send to output allows only one)')
    expect(pasteNote(0, [single('output.send')], catalog)).toBe('Nothing pasted: Send to output allows only one')
    expect(pasteNote(3, [single('output.send'), single('video.capture')], catalog)).toBe('Pasted 3 nodes, skipped 2 (only one of each allowed)')
  })
})
