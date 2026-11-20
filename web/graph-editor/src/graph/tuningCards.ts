import { deriveSections } from '../../../ui/TuningControls.js'
import { addSection, moveControlNear, moveControlToSection, reorderSections, sectionNames, type Control, type SectionState } from './controls'
import type { GraphUi } from './types'

// What a card shows and which of its menu items are live. Pure, so the rules are tested.
const sectionOf = (c: Control): string => (typeof c.section === 'string' ? c.section : '')

export const GENERAL = ''
export const sectionTitle = (name: string): string => name || 'General'

// The card's name: its label, else the param's own.
export const effectiveLabel = (c: Control, paramLabel: string): string =>
  typeof c.label === 'string' && c.label.trim() !== '' ? c.label : paramLabel

// Node, plus the param when a label hides it, so an unlabelled card never repeats its own name.
export const sourceLine = (c: Control, nodeTitle: string, paramLabel: string): string =>
  effectiveLabel(c, paramLabel) !== paramLabel ? `${nodeTitle} · ${paramLabel}` : nodeTitle

export type CardMenu = { canUp: boolean; canDown: boolean; sections: string[] }

// Move up and Down stay inside the card's section. `sections` lists the other sections it can move to
// (named ones in order, then General last), empty when the graph has no named section.
export function cardMenu(controls: Control[], ui: GraphUi | undefined, c: Control): CardMenu {
  const group = (deriveSections(controls, ui) as { section: string; controls: Control[] }[]).find((g) => g.section === sectionOf(c))
  const i = group ? group.controls.indexOf(c) : -1
  const named = sectionNames(controls, ui)
  const all = named.length > 0 ? [...named, GENERAL] : []
  return { canUp: i > 0, canDown: i >= 0 && !!group && i < group.controls.length - 1, sections: all.filter((n) => n !== sectionOf(c)) }
}

export type SectionMenu = { canUp: boolean; canDown: boolean }

// Swaps with the neighbour, keeping General last. The edges do nothing and their menu items are off.
export function moveSection(state: SectionState, name: string, delta: -1 | 1): SectionState {
  const named = sectionNames(state.controls, state.ui)
  const i = named.indexOf(name)
  const to = i + delta
  if (i < 0 || to < 0 || to >= named.length) return state
  const order = [...named]
  ;[order[i], order[to]] = [order[to], order[i]]
  return reorderSections(state, order)
}

export function sectionMenu(controls: Control[], ui: GraphUi | undefined, name: string): SectionMenu {
  const state = { controls, ui }
  return { canUp: moveSection(state, name, -1) !== state, canDown: moveSection(state, name, 1) !== state }
}

// Move to section > New section...: creates the section and puts the control in it.
export function moveToNewSection(state: SectionState, node: string, param: string, name: string): SectionState {
  const made = addSection(state, name)
  const i = made.controls.findIndex((c) => c.node === node && c.param === param)
  return made === state || i < 0 ? state : moveControlToSection(made, i, name.trim())
}

export type DropPos = 'before' | 'after' | 'on'

// A section dragged next to another (General is ''): before or after it, never onto it or below General.
export function dropSection(state: SectionState, name: string, target: string, pos: DropPos): SectionState {
  if (name === '' || name === target || pos === 'on' || (target === '' && pos === 'after')) return state
  const named = sectionNames(state.controls, state.ui)
  if (!named.includes(name)) return state
  const rest = named.filter((n) => n !== name)
  const at = target === '' ? rest.length : rest.indexOf(target) + (pos === 'after' ? 1 : 0)
  if (at < 0 || (target !== '' && !rest.includes(target))) return state
  const order = [...rest.slice(0, at), name, ...rest.slice(at)]
  return order.join('|') === named.join('|') ? state : reorderSections(state, order)
}

// A control dragged onto a section heading (to its end) or between cards. Anything else changes nothing.
export function dropControl(
  state: SectionState,
  from: { node: string; param: string },
  target: { heading: string } | { card: { node: string; param: string } },
  pos: DropPos,
): SectionState {
  const i = state.controls.findIndex((c) => c.node === from.node && c.param === from.param)
  if (i < 0) return state
  if ('heading' in target) return pos === 'on' ? moveControlToSection(state, i, target.heading) : state
  const t = state.controls.findIndex((c) => c.node === target.card.node && c.param === target.card.param)
  return pos === 'on' || t < 0 ? state : moveControlNear(state, i, t, pos === 'after')
}
