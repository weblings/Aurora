import { describe, expect, it } from 'vitest'
import { nodeLabels, nodeTitle } from './nodeTitle'

const rescale = { title: 'Rescale image' }

describe('nodeLabels', () => {
  it('uses the header title for a node whose title is unique', () => {
    const labels = nodeLabels([
      { id: 'rescale', type: 'rescale', info: rescale },
      { id: 'gain', type: 'gain', info: { title: 'Gain' } },
    ])
    expect(labels.get('rescale')).toBe('Rescale image')
    expect(labels.get('gain')).toBe('Gain')
  })

  it('adds the id when two nodes share a title', () => {
    const labels = nodeLabels([
      { id: 'rescale', type: 'rescale', info: rescale },
      { id: 'rescale2', type: 'rescale', info: rescale },
      { id: 'gain', type: 'gain', info: { title: 'Gain' } },
    ])
    expect(labels.get('rescale')).toBe('Rescale image (rescale)')
    expect(labels.get('rescale2')).toBe('Rescale image (rescale2)')
    expect(labels.get('gain')).toBe('Gain')
  })

  it('falls back to the id for a type the catalog lacks', () => {
    const labels = nodeLabels([{ id: 'mystery1', type: 'from_newer_build', info: undefined }])
    expect(labels.get('mystery1')).toBe('mystery1')
  })
})

describe('nodeTitle', () => {
  it('is the catalog title, else the type', () => {
    expect(nodeTitle(rescale, 'rescale')).toBe('Rescale image')
    expect(nodeTitle({ title: '' }, 'rescale')).toBe('rescale')
    expect(nodeTitle(undefined, 'x')).toBe('x')
  })
})
