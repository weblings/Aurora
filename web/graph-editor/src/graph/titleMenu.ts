import type { EffectListEntry, GraphDoc } from './types'
import { BLANK_ID, isDraftId, titleOf } from './save'

// What a new effect with no title is called in the title and in Open.
export const NEW_EFFECT_TITLE = 'New empty effect'

// What the title menu's New submenu offers: the dashboard's "Start from" list.
// Same rule as startPoints() in web/ui/EffectPanelModel.js (keep in sync):
// Empty, then the built-ins, hidden ones included, and Music pulse only when
// an audio input exists. Empty is the blank graph, as editorHref() sends it.
export function startPoints(effects: EffectListEntry[], hasAudio: boolean): { id: string; title: string }[] {
  const builtins = effects.filter((e) => e.builtin && (hasAudio || e.id !== 'builtin.audio'))
  return [{ id: BLANK_ID, title: 'Empty' }, ...builtins.map((e) => ({ id: e.id, title: e.title || e.id }))]
}

// The Open submenu's groups, in order: Not saved yet (new effects that exist only as a kept copy,
// 6b), Custom, Built-in. The open effect is left out, and so is an empty group. `unsaved` marks
// what gets the dot (Aurora-u68h.4): a Custom or Built-in effect with a kept copy; a Not saved yet
// group carries it on the heading instead, since every item in it is unsaved by definition.
export type OpenItem = { id: string; title: string; unsaved: boolean }
export type OpenGroup = { name: string; unsaved: boolean; items: OpenItem[] }

export function openGroups(effects: EffectListEntry[], currentId: string, kept: ReadonlyMap<string, GraphDoc> = new Map()): OpenGroup[] {
  const others = effects.filter((e) => e.id !== currentId)
  const item = (e: EffectListEntry): OpenItem => ({ id: e.id, title: e.title || e.id, unsaved: kept.has(e.id) })
  const fresh: OpenItem[] = [...kept]
    .filter(([id]) => isDraftId(id) && id !== BLANK_ID && id !== currentId)
    .map(([id, doc]) => ({ id, title: titleOf(doc) || NEW_EFFECT_TITLE, unsaved: false }))
  return [
    { name: 'Not saved yet', unsaved: true, items: fresh },
    { name: 'Custom', unsaved: false, items: others.filter((e) => !e.builtin).map(item) },
    { name: 'Built-in', unsaved: false, items: others.filter((e) => e.builtin).map(item) },
  ].filter((g) => g.items.length > 0)
}
