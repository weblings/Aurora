import { parseClip, pasteNote, pasteSelection } from './doc'
import { blankDoc, distinctTitle, setTitle } from './save'
import type { Catalog, GraphDoc } from './types'

export const NOT_GRAPH = 'Not an Aurora graph file'

export type ImportResult = { ok: true; doc: GraphDoc; added: number; note: string | null } | { ok: false; error: string }

// "my-cool-effect.aurora-graph.json" -> "My cool effect"; '' when nothing readable is left.
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.json$/i, '').replace(/\.aurora-graph$/i, '').replace(/[-_]+/g, ' ').trim()
  return base ? base[0].toUpperCase() + base.slice(1) : ''
}

// Import graph from file (Aurora-dzsd): the file text as a new graph, never merged into an open one.
// Wrong text or a file with no usable nodes is an error line and nothing else.
export function importFile(text: string, fileName: string, catalog: Catalog, takenTitles: Iterable<string>): ImportResult {
  const clip = parseClip(text)
  if (!clip) return { ok: false, error: NOT_GRAPH }
  const { doc, added, skipped } = pasteSelection(blankDoc(), clip, { x: 0, y: 0 }, catalog)
  if (added.size === 0) return { ok: false, error: pasteNote(0, skipped, catalog)?.replace('Nothing pasted', 'Nothing to import') ?? 'No nodes in that file' }
  const title = titleFromFileName(fileName)
  return {
    ok: true,
    doc: title ? setTitle(doc, distinctTitle(title, takenTitles)) : doc,
    added: added.size,
    note: pasteNote(added.size, skipped, catalog)?.replace('Pasted', 'Imported') ?? null,
  }
}
