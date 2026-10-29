import { describe, expect, it } from 'vitest'
import { clearUnsaved, loadUnsaved, restorable, saveUnsaved, syncUnsaved } from './autosave'
import { setParam } from './doc'
import { HISTORY_CAP, editorReducer, emptyEditor, type EditorAction, type EditorState } from './history'
import { builtinLike } from './fixtures'

const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state)
const open = () => run(emptyEditor, { type: 'open', doc: builtinLike() })
const gain = (state: EditorState) => state.doc!.nodes.find((n) => n.id === 'gain')!.params?.gain
const set = (value: number, live = false): EditorAction => ({
  type: 'edit',
  change: (d) => setParam(d, 'gain', 'gain', value),
  live,
})

describe('history', () => {
  it('folds a live gesture into one entry on commit', () => {
    let s = run(open(), set(1, true), set(2, true), set(3, true))
    expect(gain(s)).toBe(3)
    expect(s.past).toHaveLength(0)
    s = run(s, { type: 'commit' })
    expect(s.past).toHaveLength(1)
    s = run(s, { type: 'undo' })
    expect(gain(s)).toBe(gain(open()))
  })

  it('records nothing for a gesture that ends where it began', () => {
    const start = open()
    const s = run(start, set(5, true), { type: 'edit', change: (d) => setParam(d, 'gain', 'gain', gain(start) as number), live: true }, { type: 'commit' })
    expect(s.past).toHaveLength(0)
  })

  it('settles an open gesture before a discrete edit, undone separately', () => {
    let s = run(open(), set(2, true), set(9))
    expect(s.past).toHaveLength(2)
    s = run(s, { type: 'undo' })
    expect(gain(s)).toBe(2)
  })

  it('undoes and redoes, and a new edit clears redo', () => {
    let s = run(open(), set(2), set(3), { type: 'undo' }, { type: 'undo' })
    expect(s.future).toHaveLength(2)
    s = run(s, { type: 'redo' })
    expect(gain(s)).toBe(2)
    s = run(s, set(7))
    expect(s.future).toHaveLength(0)
    expect(run(s, { type: 'redo' })).toEqual(s)
  })

  it('caps the past at the limit, dropping the oldest', () => {
    let s = open()
    for (let i = 0; i < HISTORY_CAP + 20; i++) s = run(s, set(i + 100))
    expect(s.past).toHaveLength(HISTORY_CAP)
    for (let i = 0; i < HISTORY_CAP + 5; i++) s = run(s, { type: 'undo' })
    // The first 20 states fell off the bottom; the 20th edit's result is the oldest left.
    expect(gain(s)).toBe(119)
    expect(s.past).toHaveLength(0)
  })

  it('treats an edit that changes nothing as no entry', () => {
    const s = run(open(), set(2), set(2))
    expect(s.past).toHaveLength(1)
  })

  it('resets when another effect opens', () => {
    const s = run(open(), set(2), { type: 'undo' }, set(3), { type: 'open', doc: builtinLike() })
    expect(s.past).toHaveLength(0)
    expect(s.future).toHaveLength(0)
    expect(s.pending).toBeNull()
  })
})

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  }
}

const blocked = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
} as unknown as Storage

describe('autosave', () => {
  it('offers the stored copy after a reload with unsaved edits', () => {
    const storage = memoryStorage()
    const server = builtinLike()
    const edited = setParam(server, 'gain', 'gain', 4)
    syncUnsaved('fx', server, edited, storage)
    expect(restorable('fx', server, storage)).toEqual(edited)
  })

  it('does not offer it after a save, or when it matches the server', () => {
    const storage = memoryStorage()
    const server = builtinLike()
    const edited = setParam(server, 'gain', 'gain', 4)
    syncUnsaved('fx', server, edited, storage)
    syncUnsaved('fx', edited, edited, storage) // baseline moved to the saved doc
    expect(loadUnsaved('fx', storage)).toBeNull()
    saveUnsaved('fx', server, storage)
    expect(restorable('fx', server, storage)).toBeNull()
    expect(loadUnsaved('fx', storage)).toBeNull()
  })

  it('keeps one copy per effect and ignores junk', () => {
    const storage = memoryStorage()
    saveUnsaved('a', builtinLike(), storage)
    expect(loadUnsaved('b', storage)).toBeNull()
    storage.setItem('aurora.graphEditor.unsaved.b', '{not json')
    expect(loadUnsaved('b', storage)).toBeNull()
    clearUnsaved('a', storage)
    expect(loadUnsaved('a', storage)).toBeNull()
  })

  it('works with storage blocked or absent', () => {
    const server = builtinLike()
    expect(() => syncUnsaved('fx', server, setParam(server, 'gain', 'gain', 4), blocked)).not.toThrow()
    expect(restorable('fx', server, blocked)).toBeNull()
    expect(restorable('fx', server, null)).toBeNull()
    expect(() => clearUnsaved('fx', null)).not.toThrow()
  })
})
