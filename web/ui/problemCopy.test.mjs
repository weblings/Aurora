import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COPY, HOST_COPY, STRUCTURAL_CODES, STRUCTURAL_MESSAGE, describeIssue, hasCopy, hostCopy, problemCopy } from './problemCopy.js'

const LISTED = [
  'input_missing', 'output_unregistered', 'param_option_unknown', 'node_type_unknown', 'output_multiple_senders',
  'graph_cycle', 'node_construct_failed', 'param_invalid', 'control_node_unknown', 'control_param_unknown',
]

test('every listed code has words that are not the server text', () => {
  for (const code of LISTED) {
    const text = describeIssue({ code, message: 'SERVER', node: 'n', port: 'p', param: 'q', options: ['a'] })
    assert.notEqual(text, 'SERVER', code)
    assert.ok(text.length > 10, code)
  }
})

test('placeholders are filled from the issue fields', () => {
  assert.match(describeIssue({ code: 'input_missing', message: 'm', node: 'n', port: 'color' }), /"color"/)
  assert.match(describeIssue({ code: 'param_invalid', message: 'm', node: 'n', param: 'gain' }), /"gain"/)
  assert.match(describeIssue({ code: 'control_param_unknown', message: 'm', param: 'speed' }), /"speed"/)
  assert.match(describeIssue({ code: 'param_option_unknown', message: 'm', param: 'mode', options: ['a', 'b'] }), /"mode".*a, b/)
  assert.match(describeIssue({ code: 'node_type_unknown', message: 'm', options: ['audio.level'] }), /Did you mean "audio.level"\?/)
})

test('missing fields still read plainly', () => {
  assert.doesNotMatch(describeIssue({ code: 'input_missing', message: 'm' }), /undefined|null|""/)
  assert.doesNotMatch(describeIssue({ code: 'param_invalid', message: 'm', param: null }), /undefined|null/)
  assert.doesNotMatch(describeIssue({ code: 'node_type_unknown', message: 'm', options: [] }), /Did you mean/)
  assert.doesNotMatch(describeIssue({ code: 'param_option_unknown', message: 'm', param: 'x' }), /Pick one/)
})

test('graph_cycle reads differently with and without a node', () => {
  assert.notEqual(describeIssue({ code: 'graph_cycle', message: 'm', node: 'a' }), describeIssue({ code: 'graph_cycle', message: 'm', node: null }))
})

test('structural codes share one message', () => {
  assert.ok(STRUCTURAL_CODES.length >= 20)
  for (const code of STRUCTURAL_CODES) assert.equal(describeIssue({ code, message: 'SERVER' }), STRUCTURAL_MESSAGE, code)
})

test('unknown, missing and inherited codes fall back to the server text', () => {
  assert.equal(describeIssue({ code: 'brand_new_code', message: 'SERVER' }), 'SERVER')
  assert.equal(describeIssue({ message: 'SERVER' }), 'SERVER')
  assert.equal(describeIssue({ code: 'toString', message: 'SERVER' }), 'SERVER')
  assert.equal(problemCopy(undefined, {}, 'x'), 'x')
  assert.equal(hasCopy('constructor'), false)
})

test('no copy calls a graph problem an error', () => {
  for (const [code, entry] of Object.entries(COPY)) {
    const text = typeof entry === 'function' ? entry({ node: 'n', port: 'p', param: 'q', options: ['a'] }) : entry
    assert.doesNotMatch(text, /\berrors?\b/i, code)
  }
})

test('refused test codes have words, and a message-only refusal falls back', () => {
  assert.match(problemCopy('no_draft', {}, 'no_draft'), /Aurora doesn't have this graph/)
  assert.equal(problemCopy('cannot_test', {}, 'The lights are paused'), 'The lights are paused')
})

test('node_tick_failed reads "Runs, but <node> fails: <reason>" and never says error', () => {
  const named = describeIssue({ code: 'node_tick_failed', message: 'divide by zero.', node: 'mix1' })
  assert.equal(named, 'Runs, but "mix1" fails: divide by zero')
  assert.equal(describeIssue({ code: 'node_tick_failed', message: 'boom', node: null }), 'Runs, but this node fails: boom')
  assert.equal(describeIssue({ code: 'node_tick_failed', message: '', node: null }), 'Runs, but this node fails')
  assert.equal(describeIssue({ code: 'node_tick_failed', message: 'boom' }), 'Runs, but a node fails: boom')
  assert.doesNotMatch(named, /error/i)
})

test('host codes read as a clause after the row prefix, filled from detail', () => {
  assert.equal(hostCopy('input_not_configured', { inputKind: 'video' }, null), 'it needs a video input. Choose one in Settings.')
  assert.equal(hostCopy('input_unavailable', { inputKind: 'audio', inputName: 'USB Mic' }, null), "the audio input \"USB Mic\" isn't available.")
  assert.equal(hostCopy('input_unavailable', {}, null), "the input isn't available.")
  assert.equal(hostCopy('no_outputs', undefined, null), 'no lights are set up. Choose them in Settings.')
  assert.equal(hostCopy('node_construct_failed', { node: 'grad' }, null), "the \"grad\" node can't be set up. Open it in the editor to fix it.")
  assert.equal(hostCopy('node_construct_failed', {}, null), "a node can't be set up. Open it in the editor to fix it.")
})

test('other graph-load codes share one clause, and refused-test and runtime codes are not host codes', () => {
  for (const code of [...STRUCTURAL_CODES, 'output_unregistered', 'param_invalid', 'graph_cycle']) assert.match(hostCopy(code, {}, null), /graph has a problem/, code)
  for (const code of ['no_draft', 'node_tick_failed', 'draft_changed']) assert.equal(hostCopy(code, {}, 'SERVER'), 'SERVER', code)
})

test('host copy falls back for unknown, missing and inherited codes, and never says error', () => {
  assert.equal(hostCopy('brand_new_code', {}, 'SERVER'), 'SERVER')
  assert.equal(hostCopy(undefined, {}, 'SERVER'), 'SERVER')
  assert.equal(hostCopy('toString', {}, 'SERVER'), 'SERVER')
  for (const [code, entry] of Object.entries(HOST_COPY)) {
    const text = typeof entry === 'function' ? entry({ node: 'n', inputKind: 'audio', inputName: 'x' }) : entry
    assert.doesNotMatch(text, /errors?/i, code)
  }
})
