import type { Catalog, NodeTypeInfo } from './types'

export type PaletteGroup = { prefix: string; types: NodeTypeInfo[] }

// Catalog types grouped by the part of the type before the first dot
// ("frame.gain" -> "frame"), groups and members sorted by name.
export function paletteGroups(catalog: Catalog): PaletteGroup[] {
  const groups = new Map<string, NodeTypeInfo[]>()
  for (const info of catalog.values()) {
    const prefix = info.type.includes('.') ? info.type.slice(0, info.type.indexOf('.')) : 'other'
    groups.set(prefix, [...(groups.get(prefix) ?? []), info])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([prefix, types]) => ({ prefix, types: types.sort((a, b) => (a.title || a.type).localeCompare(b.title || b.type)) }))
}
