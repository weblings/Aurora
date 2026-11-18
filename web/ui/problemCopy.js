// People's words for what the server reports, keyed by its plain-string code (Aurora-u8jx.1).
// The server's own text (GraphLoader.cpp, TestRoutes.cpp) is written for agents and stays as it is;
// the editor shows these instead, and any code not listed here shows the server's text. The table is
// open: a later bead adds entries (runtime preview failures, shell rows) by adding to COPY or HOST_COPY,
// not by reshaping anything. Graph issues are "problems", never "errors".
//
// An entry is a string, or a function of the fields the server sent with the issue
// ({ node, port, param, options }), returning a string. Fields may be missing.

/**
 * @typedef {{ node?: string | null, port?: string | null, param?: string | null, options?: readonly string[] | null, message?: string | null }} CopyFields
 * @typedef {string | ((fields: CopyFields) => string)} CopyEntry
 * @typedef {{ effectTitle?: string, node?: string, inputKind?: string, inputName?: string }} HostFields
 * @typedef {string | ((fields: HostFields) => string)} HostEntry
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
  control_node_unknown: "A Tuning control points at a node that isn't in the graph. Remove the control, or point it at another node.",
  control_param_unknown: ({ param }) =>
    `A Tuning control points at ${param ? quoted(param) : 'a setting'} that this node doesn't have. Remove the control, or point it at another setting.`,

  // A node threw during a preview tick: the draft passed validation and Test stays on (code from core's
  // preview `errors`, Aurora-u8jx.3). The reason is the server's message, which stays for agents. A caller
  // that already names the node (its popover row, its badge) sends `node: null`, so it reads "this node";
  // a failure that names no node at all (missing `node`) reads "a node".
  node_tick_failed: ({ node, message }) => {
    const who = node ? quoted(node) : node === null ? 'this node' : 'a node'
    const reason = typeof message === 'string' ? message.trim().replace(/[.\s]+$/, '') : ''
    return reason ? `Runs, but ${who} fails: ${reason}` : `Runs, but ${who} fails`
  },

  // Refused test starts and stops (POST /api/graph/test*): codes with no message of their own.
  no_draft: "Aurora doesn't have this graph yet. Wait a moment, then try again.",
  invalid_session: "Aurora couldn't tell which editor sent that. Reload the editor, then try again.",
  invalid_body: "Aurora couldn't read that request. Reload the editor, then try again.",
  invalid_mode: "Aurora couldn't read that request. Reload the editor, then try again.",
  draft_changed: 'The graph changed since the test started. Test again, or Save and apply',
  no_test: 'No test is running',
}
for (const code of STRUCTURAL_CODES) COPY[code] = STRUCTURAL_MESSAGE

// Host errors in the shell (Aurora-u8jx.15): why an effect or a reload failed, from /api/state's error
// `code` and `detail`. Each entry is the clause after the row's prefix ("Couldn't start Sunset: "), so it
// starts lowercase. Graph-load codes reuse the graph table's codes but not its words, which say "this node".
const NOT_GRAPH_LOAD = new Set(['node_tick_failed', 'no_draft', 'invalid_session', 'invalid_body', 'invalid_mode', 'draft_changed', 'no_test'])

const kindOf = (kind) => (kind === 'audio' ? 'an audio input' : kind === 'video' ? 'a video input' : 'an input')

const GRAPH_LOAD_REASON = 'its graph has a problem. Open it in the editor to see what to fix.'

/** @type {Record<string, HostEntry>} */
export const HOST_COPY = {
  input_not_configured: ({ inputKind }) => `it needs ${kindOf(inputKind)}. Choose one in Settings.`,
  input_unavailable: ({ inputKind, inputName }) =>
    `the ${inputKind === 'audio' || inputKind === 'video' ? `${inputKind} ` : ''}input${inputName ? ` ${quoted(inputName)}` : ''} isn't available.`,
  no_outputs: 'no lights are set up. Choose them in Settings.',
  effect_unreadable: 'its file is missing or damaged.',
  node_construct_failed: ({ node }) =>
    `${node ? `the ${quoted(node)} node` : 'a node'} can't be set up. Open it in the editor to fix it.`,
}
for (const code of Object.keys(COPY)) {
  if (!Object.hasOwn(HOST_COPY, code) && !NOT_GRAPH_LOAD.has(code)) HOST_COPY[code] = GRAPH_LOAD_REASON
}

/**
 * The clause for a host error's code, filled from its `detail`; `fallback` when the code is unknown or
 * missing (an older server), so the row keeps the server's text.
 * @param {string | null | undefined} code
 * @param {Record<string, string> | null | undefined} detail
 * @param {string | null} fallback
 */
export function hostCopy(code, detail, fallback) {
  if (typeof code !== 'string' || !Object.hasOwn(HOST_COPY, code)) return fallback
  const entry = HOST_COPY[code]
  const fields = detail && typeof detail === 'object' ? detail : {}
  return (typeof entry === 'function' ? entry(fields) : entry) || fallback
}

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
