import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COPY, STRUCTURAL_CODES, STRUCTURAL_MESSAGE, describeIssue, hasCopy, problemCopy } from './problemCopy.js'

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
