import { distinctTitle } from './save'

// Rules of the naming dialog (Aurora-e4bi.13): pure, so each state is unit-tested. An error blocks the
// confirm, a notice only informs. There is no warning tier (amber is the graph-problem mark).
export type NameMsg = { tone: 'error' | 'notice'; text: string } | null

export type NameSpec = {
  title: string
  confirm: string
  label: string
  initial: string
  check: (name: string) => NameMsg
  allowEmpty?: boolean
  max?: number
}

// EffectPanelModel.js TITLE_MAX_CHARS: the server's limit, in characters.
export const TITLE_MAX = 80

export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
export const clipName = (v: string, max?: number) => (max ? [...v].slice(0, max).join('') : v)

const atLimit = (t: string): NameMsg =>
  [...t].length >= TITLE_MAX ? { tone: 'notice', text: `Names can be up to ${TITLE_MAX} characters.` } : null

// Save as new, or a first save of a built-in: a taken name still saves, under the next free one.
export function saveAsSpec(current: string, taken: string[], confirm = 'Save'): NameSpec {
  return {
    title: 'Name the new effect',
    confirm,
    label: 'Effect name',
    initial: distinctTitle(current, taken),
    max: TITLE_MAX,
    check: (t) => {
      const hit = taken.find((e) => sameName(e, t))
      if (hit) return { tone: 'notice', text: `Another effect is named "${hit}". This saves as "${distinctTitle(t, taken)}".` }
      return atLimit(t)
    },
  }
}

// Blocks on a taken name, as the Dashboard's inline rename does.
export function renameEffectSpec(current: string, taken: string[]): NameSpec {
  return {
    title: 'Rename effect',
    confirm: 'Rename',
    label: 'Effect name',
    initial: current,
    max: TITLE_MAX,
    check: (t) => {
      const hit = taken.find((e) => !sameName(e, current) && sameName(e, t))
      return hit ? { tone: 'error', text: `Another effect is named "${hit}".` } : atLimit(t)
    },
  }
}

// Sections are runs of one string, so a duplicate would merge two. Case-blind, since Tuning would show lookalikes.
export function sectionSpec(mode: 'add' | 'rename', taken: string[], initial = '', moving?: string): NameSpec {
  return {
    title: mode === 'rename' ? 'Rename section' : moving ? `New section for ${moving}` : 'New section',
    confirm: mode === 'rename' ? 'Rename' : moving ? 'Create and move' : 'Create',
    label: 'Section name',
    initial,
    check: (t) => {
      if (sameName(t, 'General')) return { tone: 'error', text: '"General" is the default section.' }
      const hit = taken.find((n) => !sameName(n, initial) && sameName(n, t))
      return hit ? { tone: 'error', text: `Another section is named "${hit}".` } : null
    },
  }
}

// The Edit control state: an empty label falls back to the param's own name, a shared label only informs.
export function controlLabelCheck(label: string, paramLabel: string, others: string[]): NameMsg {
  const t = label.trim()
  if (t === '') return { tone: 'notice', text: `Empty uses the param's own name, "${paramLabel}".` }
  const hit = others.find((o) => sameName(o, t))
  return hit ? { tone: 'notice', text: `Another control is named "${hit}". Tuning shows both.` } : null
}

// Confirm is off while the name is empty (unless allowed) or the message is an error.
export function nameBlocked(spec: { allowEmpty?: boolean }, name: string, msg: NameMsg): boolean {
  return (name.trim() === '' && !spec.allowEmpty) || msg?.tone === 'error'
}
