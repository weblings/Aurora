import type { EffectListEntry } from './types'
import { BLANK_ID } from './save'

// What the title menu's New submenu offers: the dashboard's "Start from" list.
// Same rule as startPoints() in web/ui/EffectPanelModel.js (keep in sync):
// Empty, then the built-ins, hidden ones included, and Music pulse only when
// an audio input exists. Empty is the blank graph, as editorHref() sends it.
export function startPoints(effects: EffectListEntry[], hasAudio: boolean): { id: string; title: string }[] {
  const builtins = effects.filter((e) => e.builtin && (hasAudio || e.id !== 'builtin.audio'))
  return [{ id: BLANK_ID, title: 'Empty' }, ...builtins.map((e) => ({ id: e.id, title: e.title || e.id }))]
}

// The Open submenu's groups: every effect but the open one, Custom then Built-in,
// each in list order. Empty groups are left out.
export function openGroups(effects: EffectListEntry[], currentId: string): { name: string; items: { id: string; title: string }[] }[] {
  const others = effects.filter((e) => e.id !== currentId)
  const item = (e: EffectListEntry) => ({ id: e.id, title: e.title || e.id })
  return [
    { name: 'Custom', items: others.filter((e) => !e.builtin).map(item) },
    { name: 'Built-in', items: others.filter((e) => e.builtin).map(item) },
  ].filter((g) => g.items.length > 0)
}
