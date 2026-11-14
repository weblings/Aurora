// People's words for what the server reports, keyed by its plain-string code (Aurora-u8jx.1).
// The server's own text (GraphLoader.cpp, TestRoutes.cpp) is written for agents and stays as it is;
// the editor shows these instead, and any code not listed here shows the server's text. The table is
// open: a later bead adds entries (runtime preview failures, Aurora's host-error codes for the
// shell) by adding to COPY, not by reshaping anything. Graph issues are "problems", never "errors".
//
// An entry is a string, or a function of the fields the server sent with the issue
// ({ node, port, param, options }), returning a string. Fields may be missing.

/**
 * @typedef {{ node?: string | null, port?: string | null, param?: string | null, options?: readonly string[] | null }} CopyFields
 * @typedef {string | ((fields: CopyFields) => string)} CopyEntry
 */

// Graph file damaged or written by hand: these only come from a file the editor did not make.
export const STRUCTURAL_MESSAGE = "Part of this graph's file is damaged or not in the form Aurora expects. Fix the file, or start the graph again."

export const STRUCTURAL_CODES = [
  'graph_not_object', 'version_missing', 'version_invalid', 'version_unsupported', 'minor_version_invalid',
  'title_invalid', 'description_invalid', 'tickhz_invalid', 'nodes_invalid', 'node_not_object', 'node_id_invalid',
  'node_id_duplicate', 'node_type_missing', 'params_not_object', 'param_unknown', 'edges_invalid', 'edge_malformed',
  'edge_endpoint_malformed', 'edge_node_missing', 'port_unknown_output', 'port_unknown_input', 'port_type_mismatch',
  'input_multiple_edges', 'controls_invalid', 'control_malformed', 'node_port_mismatch',
]

const quoted = (name) => `"${name}"`

// Up to five choices, for "pick one of".
function choices(options) {
  const list = (options ?? []).filter((o) => typeof o === 'string' && o !== '')
  return list.length ? ` Pick one of: ${list.slice(0, 5).join(', ')}.` : ''
}

/** @type {Record<string, CopyEntry>} */
export const COPY = {
  input_missing: ({ port }) =>
    port ? `Nothing is connected to ${quoted(port)}. Connect a wire to it.` : 'An input has nothing connected. Connect a wire to it.',
  output_unregistered: "This node sends to an output Aurora doesn't have. Pick another output from its list.",
  param_option_unknown: ({ param, options }) =>
    `${param ? quoted(param) : 'A setting'} is set to a choice that is not on its list.${choices(options)}`,
  node_type_unknown: ({ options }) => {
    const near = (options ?? []).find((o) => typeof o === 'string' && o !== '')
    return `Aurora doesn't know this kind of node.${near ? ` Did you mean ${quoted(near)}?` : ''}`
  },
  output_multiple_senders: 'Two nodes send to this output. Keep one, or combine them with a Mix frames node first.',
  graph_cycle: ({ node }) =>
    node ? 'Wires loop back through this node. Remove one wire to break the loop.' : 'The wires loop back on themselves. Remove one wire to break the loop.',
  node_construct_failed: "This node couldn't be set up. Remove it and add it again.",
  param_invalid: ({ param }) =>
    `${param ? quoted(param) : 'A setting'} has a value this node can't use. Change it, or put it back to its default.`,
  control_node_unknown: "A Dashboard control points at a node that isn't in the graph. Remove the control, or point it at another node.",
  control_param_unknown: ({ param }) =>
    `A Dashboard control points at ${param ? quoted(param) : 'a setting'} that this node doesn't have. Remove the control, or point it at another setting.`,

  // Refused test starts and stops (POST /api/graph/test*): codes with no message of their own.
  no_draft: "Aurora doesn't have this graph yet. Wait a moment, then try again.",
  invalid_session: "Aurora couldn't tell which editor sent that. Reload the editor, then try again.",
  invalid_body: "Aurora couldn't read that request. Reload the editor, then try again.",
  invalid_mode: "Aurora couldn't read that request. Reload the editor, then try again.",
  draft_changed: 'The graph changed since the test started. Test again, or Save and apply',
  no_test: 'No test is running',
}
for (const code of STRUCTURAL_CODES) COPY[code] = STRUCTURAL_MESSAGE

/** True when the table has words of its own for this code. */
export function hasCopy(code) {
  return typeof code === 'string' && Object.hasOwn(COPY, code)
}

/**
 * The words for a code, filled from the fields the server sent; `fallback` (the server's text) when the
 * code is unknown, missing, or its entry yields nothing.
 * @param {string | null | undefined} code
 * @param {CopyFields} fields
 * @param {string} fallback
 */
export function problemCopy(code, fields, fallback) {
  if (!hasCopy(code)) return fallback
  const entry = COPY[/** @type {string} */ (code)]
  const text = typeof entry === 'function' ? entry(fields ?? {}) : entry
  return text || fallback
}

/** The words for one issue as the server sent it: { code, message, node, port, param, options }. */
export function describeIssue(issue) {
  return problemCopy(issue.code, issue, issue.message)
}
