// What a Whole graph row offers to do about its problem, by the server's code (Aurora-u8jx.2).
// Only actions the editor already has. A code not listed here gets no action: most of these problems
// are fixed by editing the graph's file or a wire, and a button that does not fix the problem is noise.
// The words for each problem live in web/ui/problemCopy.js; this table is about what to do.

export type GraphRowAction = {
  label: string
  // Which editor action runs; ProblemsChip's caller maps it to the real thing.
  run: 'openControls'
}

const OPEN_CONTROLS: GraphRowAction = { label: 'Open controls', run: 'openControls' }

// Codes that can reach a Whole graph row (GraphLoader.cpp reports them with no node, or a node that is
// not in the document), with the one that has an action:
//   control_node_unknown: the Dashboard controls drawer lists the control, and its Remove button fixes it.
// No action: graph_cycle (breaking a loop means choosing a wire to delete), control_param_unknown,
// every structural code (STRUCTURAL_CODES in web/ui/problemCopy.js: the file is damaged), input_missing and
// the rest of the node codes (their node was deleted, nothing to point at), Draft would not load and
// draft_too_large (no code: the server's text only). No code asks for a new node: the loader never reports
// a graph with no output.
export const GRAPH_ROW_ACTIONS: Readonly<Record<string, GraphRowAction>> = {
  control_node_unknown: OPEN_CONTROLS,
}

export function graphRowAction(code: string | null | undefined): GraphRowAction | null {
  return typeof code === 'string' && Object.hasOwn(GRAPH_ROW_ACTIONS, code) ? GRAPH_ROW_ACTIONS[code] : null
}
