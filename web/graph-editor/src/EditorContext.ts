import { createContext, useContext } from 'react'
import type { ParamValue } from './graph/types'

// Lets the memoized node component edit the document without receiving a new
// callback (and re-rendering) on every change.
export type EditorActions = {
  // A continuous change (slider drag, typing): applied now, one undo step once
  // `commit` ends the gesture.
  setParam: (nodeId: string, name: string, value: ParamValue) => void
  commit: () => void
}

export const EditorContext = createContext<EditorActions>({ setParam: () => {}, commit: () => {} })

export function useEditorActions(): EditorActions {
  return useContext(EditorContext)
}
