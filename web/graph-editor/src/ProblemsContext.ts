import { createContext, useContext } from 'react'
import { noProblems, type NodeProblems, type Problems } from './graph/problems'

// What the draft loop found wrong, read by each node for its own badges.
export const ProblemsContext = createContext<Problems>(noProblems)

export function useNodeProblems(nodeId: string): NodeProblems | undefined {
  return useContext(ProblemsContext).nodes.get(nodeId)
}
