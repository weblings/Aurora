import { createContext, useContext } from 'react'
import type { ParamValue } from './graph/types'

// Lets the memoized node component edit the document without receiving a new
// callback (and re-rendering) on every change.
export type EditorActions = {
  // A continuous change (slider drag, typing): applied now, one undo step once
  // `commit` ends the gesture.
  setParam: (nodeId: string, name: string, value: ParamValue) => void
  commit: () => void
  // Opens the node menu at a point (the node menu button, Shift+F10). `touch`: the button was pressed by touch.
  openNodeMenu: (nodeId: string, at: { x: number; y: number }, touch?: boolean) => void
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

// What each Tuning control says about its param row, keyed by tuningKey: 'In Tuning as "<label>", <section>.'
// A param in the map gets the muted dot on its node (Aurora-e4bi.9).
export const TuningMarksContext = createContext<ReadonlyMap<string, string>>(new Map())
export const tuningKey = (node: string, param: string) => `${node}${param}`

// True in the read-only recipe viewer: nodes show their values but nothing edits and the node menu is hidden.
export const ReadOnlyContext = createContext(false)
