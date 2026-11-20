import nodesSample from '../graph/server-samples/nodes.json'
import meta from '../../../../docs/recipes/recipes.json'
import { parseClip } from '../graph/doc'
import { setPortMeanings } from '../graph/portStyle'
import type { Catalog, GraphDoc, NodeTypeInfo } from '../graph/types'
import type { Clip } from '../graph/doc'

// The recipes page reads docs/recipes/*.clip.json (the exact text Copy puts on the clipboard) and the
// sidecar recipes.json (name, description, card meta). The catalog is the editor's own sample, so the
// page never needs a running Aurora (Aurora-4g4d.2).
const files = import.meta.glob('../../../../docs/recipes/*.clip.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

type Meta = { file: string; name: string; description: string; needs: string; pasteInto?: string; layout?: string }

export type Recipe = {
  slug: string
  name: string
  description: string
  // The clip file's text, copied as is.
  text: string
  clip: Clip
  doc: GraphDoc
  // Card lines: Needs, then only the exceptions.
  needs: string
  notes: string[]
  // Set when the clip is a fragment for an existing graph, not a whole graph.
  pasteInto?: string
  layout?: string
}

const sample = nodesSample as unknown as { nodes: NodeTypeInfo[]; portTypes: { name: string; meaning: string }[] }
setPortMeanings(sample.portTypes)
export const catalog: Catalog = new Map(sample.nodes.map((n) => [n.type, n]))

const isWhole = (clip: Clip) => clip.nodes.some((n) => catalog.get(n.type)?.sink)

export function describeRecipe(m: Meta, text: string): Recipe {
  const clip = parseClip(text)
  if (!clip) throw new Error(`${m.file}: not a graph clip`)
  const notes: string[] = []
  if (m.pasteInto) notes.push(`Paste into ${m.pasteInto}`)
  else if (isWhole(clip)) notes.push('Whole graph, paste into an empty graph only')
  if (m.layout) notes.push(m.layout)
  const tuning = clip.controls.length
  if (tuning > 0) notes.push(`Comes with ${tuning} Tuning control${tuning === 1 ? '' : 's'}`)
  return {
    slug: m.file,
    name: m.name,
    description: m.description,
    text: text.trim(),
    clip,
    doc: { nodes: clip.nodes, edges: clip.edges, ui: clip.ui, controls: clip.controls },
    needs: m.needs,
    notes,
    pasteInto: m.pasteInto,
    layout: m.layout,
  }
}

export const rawClips = files
export const clipText = (file: string): string | undefined =>
  Object.entries(files).find(([path]) => path.endsWith(`/${file}.clip.json`))?.[1]

export const recipes: Recipe[] = (meta.recipes as Meta[]).map((m) => {
  const text = clipText(m.file)
  if (text === undefined) throw new Error(`recipes.json names ${m.file} but docs/recipes has no ${m.file}.clip.json`)
  return describeRecipe(m, text)
})
