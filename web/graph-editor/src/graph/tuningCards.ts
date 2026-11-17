import { deriveSections } from '../../../ui/TuningControls.js'
import { addSection, moveControlToSection, reorderSections, sectionNames, type Control, type SectionState } from './controls'
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

// Swaps with the neighbour. An empty section stored first cannot lead (deriveSections places it after
// the one it followed), so a swap that would not show is refused and its menu item is off.
export function moveSection(state: SectionState, name: string, delta: -1 | 1): SectionState {
  const named = sectionNames(state.controls, state.ui)
  const i = named.indexOf(name)
  const to = i + delta
  if (i < 0 || to < 0 || to >= named.length) return state
  const order = [...named]
  ;[order[i], order[to]] = [order[to], order[i]]
  const next = reorderSections(state, order)
  return sectionNames(next.controls, next.ui).join('|') === order.join('|') ? next : state
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
