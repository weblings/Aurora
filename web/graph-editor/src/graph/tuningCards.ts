import { deriveSections } from '../../../ui/TuningControls.js'
import { sectionNames, type Control } from './controls'
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

// Move up and Down order the named sections: General stays last and has no menu.
export function sectionMenu(controls: Control[], ui: GraphUi | undefined, name: string): SectionMenu {
  const named = sectionNames(controls, ui)
  const i = named.indexOf(name)
  return { canUp: i > 0, canDown: i >= 0 && i < named.length - 1 }
}
