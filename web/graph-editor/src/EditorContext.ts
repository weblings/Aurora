import { createContext, useContext } from 'react'
import type { ParamValue } from './graph/types'

// Lets the memoized node component edit the document without receiving a new
// callback (and re-rendering) on every change.
export type EditorActions = {
  // A continuous change (slider drag, typing): applied now, one undo step once
  // `commit` ends the gesture.
  setParam: (nodeId: string, name: string, value: ParamValue) => void
  commit: () => void
  // Opens the node menu at a point (the node menu button, Shift+F10).
  openNodeMenu: (nodeId: string, at: { x: number; y: number }) => void
  // Opens the param menu (Add to or Remove from Tuning) for one param row.
  openParamMenu: (nodeId: string, param: string, label: string, at: { x: number; y: number }) => void
}

export const EditorContext = createContext<EditorActions>({ setParam: () => {}, commit: () => {}, openNodeMenu: () => {}, openParamMenu: () => {} })

// True in developer builds (Debug, RelWithDebInfo): node ids appear in tooltips and Details.
export const ShowNodeIdsContext = createContext(false)

export function useShowNodeIds(): boolean {
  return useContext(ShowNodeIdsContext)
}

export function useEditorActions(): EditorActions {
  return useContext(EditorContext)
}
