import type { GraphDoc, NodeTypeInfo } from './types'

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

function withControls(doc: GraphDoc, controls: Control[]): GraphDoc {
  if (controls.length === 0 && doc.controls === undefined) return doc
  return { ...doc, controls }
}

// Appends the param to the Dashboard with a label and section from the catalog.
export function addControl(doc: GraphDoc, node: string, param: string, info: NodeTypeInfo | undefined): GraphDoc {
  if (controlIndex(doc, node, param) >= 0) return doc
  const paramInfo = info?.params.find((p) => p.name === param)
  const entry: Control = {
    node,
    param,
    label: paramInfo?.label || param,
    section: info?.title || '',
  }
  return withControls(doc, [...controlsOf(doc), entry])
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
  return { ...doc, controls: controlsOf(doc).filter((c) => !nodes.has(c.node)) }
}
