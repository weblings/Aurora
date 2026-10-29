import type { GraphDoc } from './types'

// The effect id a new custom effect gets: the server accepts a-z, 0-9, '_' and
// '-' (not first), up to 64.
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return slug || 'effect'
}

// A slug no existing effect uses: name, name-2, name-3, ...
export function freshEffectId(title: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = slugify(title)
  if (!used.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!used.has(candidate)) return candidate
  }
}

export function titleOf(doc: GraphDoc): string {
  return typeof doc.title === 'string' ? doc.title : ''
}

export function setTitle(doc: GraphDoc, title: string): GraphDoc {
  return { ...doc, title }
}
