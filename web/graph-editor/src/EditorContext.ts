import { createContext, useContext } from 'react'
import type { ParamValue } from './graph/types'

// Lets the memoized node component edit the document without receiving a new
// callback (and re-rendering) on every change.
export type EditorActions = {
  setParam: (nodeId: string, name: string, value: ParamValue) => void
}

export const EditorContext = createContext<EditorActions>({ setParam: () => {} })

export function useEditorActions(): EditorActions {
  return useContext(EditorContext)
}
