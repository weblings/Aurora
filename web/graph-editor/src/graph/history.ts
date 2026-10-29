import type { GraphDoc } from './types'

// Undo history over the one graph document: snapshots, not patches, because
// every edit already returns a new document (see doc.ts). Selection, pan and
// zoom live in React Flow, not in the document, so they are never recorded.

export const HISTORY_CAP = 100

export type EditorState = {
  // null until an effect has loaded.
  doc: GraphDoc | null
  past: GraphDoc[]
  future: GraphDoc[]
  // The document as it was when a continuous gesture (slider drag, typing)
  // began; becomes one history entry when the gesture ends.
  pending: GraphDoc | null
}

export type EditorAction =
  | { type: 'open'; doc: GraphDoc | null }
  // `live` edits update the document at once but join the history only when
  // `commit` ends the gesture; the rest are one entry each.
  | { type: 'edit'; change: (doc: GraphDoc) => GraphDoc; live?: boolean }
  | { type: 'commit' }
  | { type: 'undo' }
  | { type: 'redo' }

export const emptyEditor: EditorState = { doc: null, past: [], future: [], pending: null }

export function sameDoc(a: GraphDoc, b: GraphDoc): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

function push(stack: GraphDoc[], doc: GraphDoc): GraphDoc[] {
  const next = [...stack, doc]
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next
}

// Closes an open gesture: one entry if it changed anything.
function settle(state: EditorState): EditorState {
  const { pending, doc } = state
  if (!pending) return state
  if (!doc || sameDoc(pending, doc)) return { ...state, pending: null }
  return { ...state, past: push(state.past, pending), future: [], pending: null }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'open':
      // Another effect (or none): history does not carry over.
      return { doc: action.doc, past: [], future: [], pending: null }
    case 'commit':
      return settle(state)
    case 'edit': {
      if (!state.doc) return state
      if (action.live) {
        const next = action.change(state.doc)
        return { ...state, doc: next, pending: state.pending ?? state.doc }
      }
      const settled = settle(state)
      const before = settled.doc!
      const next = action.change(before)
      // React Flow reports a node's edges as removed too; that is no change.
      if (sameDoc(before, next)) return settled
      return { doc: next, past: push(settled.past, before), future: [], pending: null }
    }
    case 'undo': {
      const settled = settle(state)
      const { doc, past, future } = settled
      if (!doc || past.length === 0) return settled
      return { doc: past[past.length - 1], past: past.slice(0, -1), future: [...future, doc], pending: null }
    }
    case 'redo': {
      const settled = settle(state)
      const { doc, past, future } = settled
      if (!doc || future.length === 0) return settled
      return { doc: future[future.length - 1], past: push(past, doc), future: future.slice(0, -1), pending: null }
    }
  }
}
