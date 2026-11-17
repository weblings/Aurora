import { SECTIONS_KEY, deriveSections } from '../../../ui/TuningControls.js'
import type { GraphDoc, GraphUi } from './types'

// The graph's `controls` list: the params the Dashboard's Tuning shows, in
// order. The loader checks only node and param; label, section and tooltip are
// for Tuning, and keys the editor does not know (built-ins carry `config`)
// stay on the entry.
export type Control = {
  node: string
  param: string
  label?: string
  section?: string
  tooltip?: string
  [extra: string]: unknown
}

export type ControlText = Pick<Control, 'label' | 'section' | 'tooltip'>

export function controlsOf(doc: GraphDoc): Control[] {
  const raw = doc.controls
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (c): c is Control => typeof c === 'object' && c !== null && typeof c.node === 'string' && typeof c.param === 'string',
  )
}

export function controlIndex(doc: GraphDoc, node: string, param: string): number {
  return controlsOf(doc).findIndex((c) => c.node === node && c.param === param)
}

// Controls plus the ui object that may hold the '#sections' key: what the section helpers take and return.
export type SectionState = { controls: Control[]; ui: GraphUi | undefined }

const sectionName = (c: Control): string => (typeof c.section === 'string' ? c.section : '')

// Named section names in the order both screens show them, empty ones included.
export function sectionNames(controls: Control[], ui: GraphUi | undefined): string[] {
  return (deriveSections(controls, ui) as { section: string }[]).map((g) => g.section).filter((n) => n !== '')
}

// Controls grouped by `order` (named sections), then General; unlisted names follow in first-appearance order.
function arrange(controls: Control[], order: string[]): Control[] {
  const names = [...order, ...sectionNames(controls, undefined).filter((n) => !order.includes(n))]
  return [...names.flatMap((n) => controls.filter((c) => sectionName(c) === n)), ...controls.filter((c) => sectionName(c) === '')]
}

// The array both screens show, written back so stored order matches (PresetRoutes and MCP read it).
export function regroup(controls: Control[], ui?: GraphUi): Control[] {
  return (deriveSections(controls, ui) as { controls: Control[] }[]).flatMap((g) => g.controls)
}

// Regroups `controls` by `order` and keeps the '#sections' key only while a section in `order` is empty.
function settle(controls: Control[], ui: GraphUi | undefined, order: string[]): SectionState {
  const flat = arrange(controls, order)
  const used = new Set(flat.map(sectionName))
  const nextUi: GraphUi | undefined = ui ? { ...ui } : undefined
  if (order.some((n) => !used.has(n))) return { controls: flat, ui: { ...nextUi, [SECTIONS_KEY]: [...order] } }
  if (nextUi) delete nextUi[SECTIONS_KEY]
  return { controls: flat, ui: nextUi }
}

// Empty sections stay while their controls leave: `before` is the state the edit started from.
function commit(before: SectionState, controls: Control[]): SectionState {
  return settle(controls, before.ui, sectionNames(before.controls, before.ui))
}

// Moves a control to the end of `section` ('' is General).
export function moveControlToSection(state: SectionState, index: number, section: string): SectionState {
  const c = state.controls[index]
  if (!c || sectionName(c) === section) return state
  const next: Control = { ...c, section }
  if (section === '') delete next.section
  return commit(state, [...state.controls.filter((_, i) => i !== index), next])
}

// An empty or taken name changes nothing. General cannot be renamed.
export function renameSection(state: SectionState, from: string, to: string): SectionState {
  const name = to.trim()
  const names = sectionNames(state.controls, state.ui)
  if (from === '' || !names.includes(from) || name === '' || name === from || names.includes(name)) return state
  const controls = state.controls.map((c) => (sectionName(c) === from ? { ...c, section: name } : c))
  return settle(controls, state.ui, names.map((n) => (n === from ? name : n)))
}

// The section's controls go to General.
export function deleteSection(state: SectionState, name: string): SectionState {
  const names = sectionNames(state.controls, state.ui)
  if (name === '' || !names.includes(name)) return state
  const moved = state.controls.filter((c) => sectionName(c) === name).map(({ section: _gone, ...rest }) => rest as Control)
  const controls = [...state.controls.filter((c) => sectionName(c) !== name), ...moved]
  return settle(controls, state.ui, names.filter((n) => n !== name))
}

// A new empty section after `after` (else last, before General). A blank or taken name changes nothing.
export function addSection(state: SectionState, name: string, after?: string): SectionState {
  const label = name.trim()
  const names = sectionNames(state.controls, state.ui)
  if (label === '' || names.includes(label)) return state
  const at = after !== undefined && names.includes(after) ? names.indexOf(after) + 1 : names.length
  return settle(state.controls, state.ui, [...names.slice(0, at), label, ...names.slice(at)])
}

// `order` lists named sections; any it leaves out follow in their current order.
export function reorderSections(state: SectionState, order: string[]): SectionState {
  const names = sectionNames(state.controls, state.ui)
  const wanted = order.filter((n, i) => names.includes(n) && order.indexOf(n) === i)
  return settle(state.controls, state.ui, [...wanted, ...names.filter((n) => !wanted.includes(n))])
}

// Every controls edit writes the regrouped array and keeps empty sections in the ui key.
function withControls(doc: GraphDoc, controls: Control[]): GraphDoc {
  if (controls.length === 0 && doc.controls === undefined) return doc
  return withSections(doc, commit({ controls: controlsOf(doc), ui: doc.ui }, controls))
}

// Writes a section edit's result back to the doc.
export function withSections(doc: GraphDoc, state: SectionState): GraphDoc {
  const next: GraphDoc = { ...doc, controls: state.controls }
  if (state.ui) next.ui = state.ui
  else delete next.ui
  return next
}

// Appends the param to the Dashboard in General, with no label key (Tuning falls back to the param's own).
export function addControl(doc: GraphDoc, node: string, param: string): GraphDoc {
  if (controlIndex(doc, node, param) >= 0) return doc
  return withControls(doc, [...controlsOf(doc), { node, param }])
}

export function removeControl(doc: GraphDoc, index: number): GraphDoc {
  return withControls(doc, controlsOf(doc).filter((_, i) => i !== index))
}

// An empty tooltip drops the key, so Tuning falls back to the param's own text.
export function updateControl(doc: GraphDoc, index: number, patch: ControlText): GraphDoc {
  const controls = controlsOf(doc)
  if (!controls[index]) return doc
  const next: Control = { ...controls[index], ...patch }
  if (typeof next.tooltip === 'string' && next.tooltip.trim() === '') delete next.tooltip
  return withControls(doc, controls.map((c, i) => (i === index ? next : c)))
}

export function moveControl(doc: GraphDoc, index: number, delta: -1 | 1): GraphDoc {
  const controls = controlsOf(doc)
  const to = index + delta
  if (!controls[index] || to < 0 || to >= controls.length) return doc
  const next = [...controls]
  ;[next[index], next[to]] = [next[to], next[index]]
  return withControls(doc, next)
}

// A deleted node takes its controls with it: the loader refuses a control
// that names a node the graph does not have.
export function dropControlsOf(doc: GraphDoc, nodes: ReadonlySet<string>): GraphDoc {
  if (!Array.isArray(doc.controls)) return doc
  return withControls(doc, controlsOf(doc).filter((c) => !nodes.has(c.node)))
}
