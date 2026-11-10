import type { Catalog, NodeTypeInfo } from './types'

// The Add node menu's seven groups, in signal-flow order (catalog `group`).
export const GROUP_ORDER = ['Sources', 'Audio', 'Image', 'Color', 'Numbers', 'Motion', 'Lights']

export type AddGroup = { name: string; types: NodeTypeInfo[] }

const label = (i: NodeTypeInfo) => i.title || i.type

// The row text: the user-facing summary, else the agent text.
export const summaryOf = (i: NodeTypeInfo) => i.summary || i.purpose
export const tipOf = (i: NodeTypeInfo) => i.tip || i.useWhen

// One entry per group, known groups first in GROUP_ORDER, any other after them
// by name; a type with no group lands in "Other". Members sort by name.
export function addGroups(catalog: Catalog): AddGroup[] {
  const by = new Map<string, NodeTypeInfo[]>()
  for (const info of catalog.values()) {
    const g = info.group || 'Other'
    by.set(g, [...(by.get(g) ?? []), info])
  }
  const rank = (g: string) => {
    const i = GROUP_ORDER.indexOf(g)
    return i < 0 ? GROUP_ORDER.length : i
  }
  return [...by.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([name, types]) => ({ name, types: [...types].sort((a, b) => label(a).localeCompare(label(b))) }))
}

const has = (text: string, q: string) => text.toLowerCase().includes(q)

// Ranked search: name matches (title or type id) first, then nodes that match
// only in their summary, tip or agent text. Each list is sorted by name.
export function searchNodes(catalog: Catalog, query: string): { byName: NodeTypeInfo[]; byText: NodeTypeInfo[] } {
  const q = query.trim().toLowerCase()
  if (!q) return { byName: [], byText: [] }
  const byName: NodeTypeInfo[] = []
  const byText: NodeTypeInfo[] = []
  for (const info of catalog.values()) {
    if (has(info.title, q) || has(info.type, q)) byName.push(info)
    else if ([info.summary, info.tip, info.purpose, info.useWhen, info.group].some((t) => has(t ?? '', q))) byText.push(info)
  }
  const sort = (l: NodeTypeInfo[]) => l.sort((a, b) => label(a).localeCompare(label(b)))
  return { byName: sort(byName), byText: sort(byText) }
}
