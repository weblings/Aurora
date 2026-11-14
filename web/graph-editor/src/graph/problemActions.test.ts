import { describe, expect, it } from 'vitest'
import { STRUCTURAL_CODES } from '../../../ui/problemCopy.js'
import { GRAPH_ROW_ACTIONS, graphRowAction } from './problemActions'
import { groupProblems } from './problems'

describe('Whole graph row actions (Aurora-u8jx.2)', () => {
  it('only an unknown Dashboard control node opens the controls drawer', () => {
    expect(Object.keys(GRAPH_ROW_ACTIONS)).toEqual(['control_node_unknown'])
    expect(graphRowAction('control_node_unknown')).toEqual({ label: 'Open controls', run: 'openControls' })
  })

  it('cycles, structural codes, unknown codes and no code get no action', () => {
    for (const code of ['graph_cycle', 'control_param_unknown', 'input_missing', ...STRUCTURAL_CODES, 'host_new', '', null, undefined]) {
      expect(graphRowAction(code)).toBeNull()
    }
    expect(graphRowAction('toString')).toBeNull()
  })

  it('a Whole graph row carries its code\'s action by its text', () => {
    const p = groupProblems(
      [
        { node: null, code: 'control_node_unknown', message: 'server' },
        { node: null, code: 'graph_cycle', message: 'cycle' },
        { node: null, message: 'Draft would not load' },
        { node: 'gone', code: 'control_node_unknown', message: 'server' },
      ],
      [],
      new Set(['a']),
    )
    expect(p.graph).toHaveLength(3)
    expect(p.graphActions.size).toBe(1)
    const [row] = [...p.graphActions.keys()]
    expect(p.graph).toContain(row)
    expect(p.graphActions.get(row)?.run).toBe('openControls')
  })
})
