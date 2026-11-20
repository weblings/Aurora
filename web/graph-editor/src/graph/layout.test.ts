import { describe, expect, it } from 'vitest'
import { NODE_GAP, NODE_WIDTH, estimateHeight, separate, tidyPositions } from './layout'
import { catalog } from './fixtures'
import type { GraphDoc, Position } from './types'

const doc: GraphDoc = {
  nodes: [
    { id: 'a', type: 'video.capture' },
    { id: 'b', type: 'video.capture' },
    { id: 'c', type: 'video.capture' },
  ],
  edges: [],
}
const h = estimateHeight(doc, catalog, 'a')
const overlaps = (p: Record<string, Position>, ids: string[]) =>
  ids.some((x, i) => ids.slice(i + 1).some((y) => Math.abs(p[x].x - p[y].x) < NODE_WIDTH + NODE_GAP && Math.abs(p[x].y - p[y].y) < h + NODE_GAP))

describe('separate', () => {
  it('leaves clear nodes alone', () => {
    const at = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, c: { x: 0, y: h + NODE_GAP } }
    expect(separate(doc, catalog, at)).toEqual(at)
  })

  it('pushes nodes stacked on one spot down, in order, with the gap', () => {
    const out = separate(doc, catalog, { a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, c: { x: 0, y: 0 } })
    expect(out.a).toEqual({ x: 0, y: 0 })
    expect(out.b.y).toBe(h + NODE_GAP)
    expect(out.c.y).toBe(2 * (h + NODE_GAP))
    expect(overlaps(out, ['a', 'b', 'c'])).toBe(false)
  })

  it('never moves a pinned node, and moves the loose one clear of it', () => {
    const out = separate(doc, catalog, { a: { x: 0, y: 0 }, b: { x: 10, y: 5 }, c: { x: 500, y: 0 } }, new Set(['b']))
    expect(out.b).toEqual({ x: 10, y: 5 })
    expect(out.a.y).toBe(5 + h + NODE_GAP)
    expect(out.c).toEqual({ x: 500, y: 0 })
  })

  it('uses measured sizes when given', () => {
    const out = separate(doc, catalog, { a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, c: { x: 900, y: 0 } }, new Set(), { a: { width: 240, height: 500 } })
    expect(out.b.y).toBe(500 + NODE_GAP)
  })
})

import { layered } from './layout'

describe('layered', () => {
  const chain: GraphDoc = {
    nodes: [
      { id: 'src', type: 'video.capture' },
      { id: 'side', type: 'video.capture' },
      { id: 'a', type: 'image.rescale' },
      { id: 'b', type: 'image.rescale' },
    ],
    edges: [['src.image', 'a.image'], ['a.image', 'b.image']],
  }

  it('puts each node a column right of what feeds it, and a loose source beside its consumer', () => {
    const out = layered(chain, catalog)
    expect(out.a.x).toBeGreaterThan(out.src.x)
    expect(out.b.x).toBeGreaterThan(out.a.x)
    expect(out.side.x).toBe(out.src.x)
  })

  it('keeps a straight chain level and nothing overlapping', () => {
    const out = layered(chain, catalog)
    expect(out.a.y).toBe(out.src.y)
    expect(out.b.y).toBe(out.src.y)
    expect(out.side.y).toBeGreaterThanOrEqual(out.src.y + estimateHeight(chain, catalog, 'src') + NODE_GAP)
  })

  it('uses measured widths for the column spacing', () => {
    const out = layered(chain, catalog, { src: { width: 500, height: 40 } })
    expect(out.a.x).toBeGreaterThanOrEqual(500)
  })
})

describe('layered long wires', () => {
  // a -> b -> c, and a -> c skipping b's column: b must not sit on the a -> c lane.
  const skip: GraphDoc = {
    nodes: [
      { id: 'a', type: 'image.rescale' },
      { id: 'b', type: 'image.rescale' },
      { id: 'c', type: 'image.mix' },
    ],
    edges: [['a.image', 'b.image'], ['b.image', 'c.a'], ['a.image', 'c.b']],
  }

  it('keeps a node out of the lane of a wire that skips its column', () => {
    const out = layered(skip, catalog)
    const bH = estimateHeight(skip, catalog, 'b')
    // The straight line from a's port row to c's, where it crosses b, misses b's box.
    const t = (out.b.x + 120 - out.a.x) / (out.c.x - out.a.x)
    const lineY = out.a.y + 48 + t * (out.c.y - out.a.y)
    expect(lineY < out.b.y || lineY > out.b.y + bH).toBe(true)
  })
})

describe('tidyPositions', () => {
  const wired: GraphDoc = {
    nodes: [
      { id: 'src', type: 'video.capture' },
      { id: 'a', type: 'image.rescale' },
      { id: 'b', type: 'image.rescale' },
    ],
    edges: [['src.image', 'a.image'], ['a.image', 'b.image']],
    ui: { src: { x: 500, y: 300 }, a: { x: 0, y: 0 }, b: { x: 0, y: 0 } },
  }

  it('lays out every node when none are named, keeping the top-left', () => {
    const out = tidyPositions(wired, catalog, null)
    expect(out.a.x).toBeGreaterThan(out.src.x)
    expect(out.b.x).toBeGreaterThan(out.a.x)
    expect(Math.min(...Object.values(out).map((p) => p.x))).toBe(0)
    expect(Math.min(...Object.values(out).map((p) => p.y))).toBe(0)
  })

  it('moves only the named nodes, and keeps them clear of the rest', () => {
    const out = tidyPositions(wired, catalog, new Set(['a', 'b']))
    expect(Object.keys(out).sort()).toEqual(['a', 'b'])
    expect(out.b.x).toBeGreaterThan(out.a.x)
  })

  it('returns nothing for an empty graph', () => {
    expect(tidyPositions({ nodes: [], edges: [] }, catalog, null)).toEqual({})
  })
})
