import { describe, expect, it } from 'vitest'
import { parseClip, pasteSelection, splitEndpoint } from '../graph/doc'
import { refuseConnection } from '../graph/connection'
import type { GraphDoc } from '../graph/types'
import { catalog, clipText, rawClips, recipes } from './recipes'
import { diagram, outlineSteps } from './outline'
import meta from '../../../../docs/recipes/recipes.json'

// Drift test (Aurora-4g4d.2): every docs/recipes clip must still paste into the editor against the catalog
// sample, so a renamed node, port or param fails the build instead of a user's paste.
const empty: GraphDoc = { nodes: [], edges: [], ui: {} }

describe('docs/recipes', () => {
  it('has one sidecar entry per clip file and no strays', () => {
    const files = Object.keys(rawClips).map((p) => p.split('/').pop()!.replace('.clip.json', '')).sort()
    expect(meta.recipes.map((r) => r.file).sort()).toEqual(files)
  })

  for (const recipe of recipes) {
    describe(recipe.slug, () => {
      it('is a marked clip that parseClip reads whole', () => {
        const clip = parseClip(clipText(recipe.slug)!)
        expect(clip).not.toBeNull()
        const raw = JSON.parse(clipText(recipe.slug)!)
        expect(clip!.nodes).toHaveLength(raw.nodes.length)
        expect(clip!.edges).toHaveLength(raw.edges.length)
        expect(clip!.controls).toHaveLength(raw.controls?.length ?? 0)
      })

      it('pastes into an empty graph with nothing skipped and every wire kept', () => {
        const out = pasteSelection(empty, recipe.clip, { x: 0, y: 0 }, catalog)
        expect(out.skipped).toEqual([])
        expect(out.doc.nodes).toHaveLength(recipe.clip.nodes.length)
        expect(out.doc.edges).toHaveLength(recipe.clip.edges.length)
        expect(out.doc.controls ?? []).toHaveLength(recipe.clip.controls.length)
      })

      it('wires only existing ports of matching type, one edge per input, no cycles', () => {
        let doc: GraphDoc = { ...recipe.doc, edges: [] }
        for (const [a, b] of recipe.clip.edges) {
          const from = splitEndpoint(a)
          const to = splitEndpoint(b)
          const reason = refuseConnection(doc, catalog, { source: from.node, sourceHandle: from.port, target: to.node, targetHandle: to.port })
          expect(reason, `${a} -> ${b}`).toBeNull()
          doc = { ...doc, edges: [...doc.edges, [a, b]] }
        }
      })

      it('sets only params the catalog knows, with values in range', () => {
        for (const node of recipe.clip.nodes) {
          const info = catalog.get(node.type)!
          for (const [name, value] of Object.entries(node.params ?? {})) {
            const param = info.params.find((p) => p.name === name)
            expect(param, `${node.id}.${name}`).toBeDefined()
            if (value === null) expect(param!.allowsUnset, `${node.id}.${name}`).toBe(true)
            else if (typeof value === 'number') {
              if (param!.min !== undefined) expect(value).toBeGreaterThanOrEqual(param!.min)
              if (param!.max !== undefined) expect(value).toBeLessThanOrEqual(param!.max)
            } else if (typeof value === 'string' && param!.options?.length) expect(param!.options).toContain(value)
          }
        }
      })

      it('points its Tuning controls at real params, and leaves no required input open', () => {
        for (const c of recipe.clip.controls) {
          const node = recipe.clip.nodes.find((n) => n.id === c.node)
          expect(node, c.label).toBeDefined()
          expect(catalog.get(node!.type)!.params.some((p) => p.name === c.param), `${c.node}.${c.param}`).toBe(true)
        }
        // A fragment is wired into the user's graph, so only whole graphs must be self-contained.
        if (recipe.clip.nodes.some((n) => catalog.get(n.type)?.sink)) {
          for (const node of recipe.clip.nodes) {
            for (const port of catalog.get(node.type)!.inputs.filter((p) => p.required)) {
              expect(recipe.clip.edges.some(([, to]) => to === `${node.id}.${port.name}`), `${node.id}.${port.name}`).toBe(true)
            }
          }
        }
      })

      it('gives the outline and the diagram every node and wire', () => {
        expect(outlineSteps(recipe.doc, catalog).map((s) => s.id).sort()).toEqual(recipe.clip.nodes.map((n) => n.id).sort())
        const pic = diagram(recipe.doc, catalog)
        expect(pic.boxes).toHaveLength(recipe.clip.nodes.length)
        expect(pic.wires).toHaveLength(recipe.clip.edges.length)
      })
    })
  }

  it('a whole graph skips its output.send when the graph already has one', () => {
    const candles = recipes.find((r) => r.slug === 'candles')!
    const first = pasteSelection(empty, candles.clip, { x: 0, y: 0 }, catalog)
    const second = pasteSelection(first.doc, candles.clip, { x: 0, y: 0 }, catalog)
    expect(second.skipped.map((s) => s.type)).toEqual(['output.send'])
  })
})
