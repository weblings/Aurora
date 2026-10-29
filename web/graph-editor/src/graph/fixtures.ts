import type { Catalog, GraphDoc, NodeTypeInfo } from './types'

// A slice of the /api/nodes catalog, shaped like the server's output, and
// graphs shaped like the built-in Video graph and a custom one.

const port = (name: string, type: string, required = true) => ({ name, type, description: `${name} port`, required })

const types: NodeTypeInfo[] = [
  {
    type: 'video.capture', title: 'Screen capture', purpose: '', useWhen: '', example: '', cost: '',
    inputs: [], outputs: [port('image', 'Image')], params: [],
  },
  {
    type: 'image.rescale', title: 'Rescale', purpose: '', useWhen: '', example: '', cost: '',
    inputs: [port('image', 'Image')], outputs: [port('image', 'Image')],
    params: [
      { name: 'width', kind: 'float', description: '', label: 'Width', min: 1, max: 512, step: 1, unit: 'px', default: 64 },
      { name: 'interpolation', kind: 'enum', description: '', options: ['area', 'linear'], default: 'area' },
    ],
  },
  {
    type: 'zones.sample', title: 'Sample zones', purpose: '', useWhen: '', example: '', cost: '',
    inputs: [port('image', 'Image')], outputs: [port('frame', 'Frame')],
    params: [{ name: 'output', kind: 'enum', description: '', options: ['hue', 'strip'], default: 'hue' }],
  },
  {
    type: 'frame.gain', title: 'Gain', purpose: '', useWhen: '', example: '', cost: '',
    inputs: [port('frame', 'Frame')], outputs: [port('frame', 'Frame')],
    params: [
      { name: 'gain', kind: 'float', description: '', min: 0, max: 2, step: 0.05, default: 1 },
      { name: 'cap', kind: 'optional-float', description: '', min: 0, max: 1, step: 0.05, default: 0, allowsUnset: true },
      { name: 'invert', kind: 'bool', description: '', default: false },
      {
        name: 'tint', kind: 'gradient', description: '',
        default: [{ pos: 0, color: '#000000' }, { pos: 1, color: '#ffffff' }],
      },
    ],
  },
  {
    type: 'audio.bounce', title: 'Bounce', purpose: '', useWhen: '', example: '', cost: '',
    inputs: [], outputs: [port('color', 'Color')], params: [],
  },
  {
    type: 'output.send', title: 'Send to output', purpose: '', useWhen: '', example: '', cost: '',
    inputs: [port('frame', 'Frame')], outputs: [],
    params: [{ name: 'output', kind: 'enum', description: '', options: ['hue', 'strip'], default: 'hue' }],
    sink: 'output',
  },
]

export const catalog: Catalog = new Map(types.map((t) => [t.type, t]))

// Like a built-in: no `ui`, extra top-level keys the editor must not lose.
export const builtinLike = (): GraphDoc => ({
  version: 1,
  tickHz: 60,
  nodes: [
    { id: 'cap', type: 'video.capture', params: {} },
    { id: 'rescale', type: 'image.rescale', params: { width: 64 } },
    { id: 'zones', type: 'zones.sample', params: { output: 'hue' } },
    { id: 'gain', type: 'frame.gain', params: {} },
    { id: 'send', type: 'output.send', params: { output: 'hue' } },
  ],
  edges: [
    ['cap.image', 'rescale.image'],
    ['rescale.image', 'zones.image'],
    ['zones.frame', 'gain.frame'],
    ['gain.frame', 'send.frame'],
  ],
  controls: [{ node: 'gain', param: 'gain' }],
})

// Like a saved custom effect: positions in `ui`, a key that is not a node id.
export const customLike = (): GraphDoc => ({
  version: 1,
  title: 'Mine',
  nodes: [
    { id: 'cap', type: 'video.capture' },
    { id: 'zones', type: 'zones.sample', params: { output: 'strip' } },
    { id: 'send', type: 'output.send', params: { output: 'strip' } },
  ],
  edges: [['cap.image', 'zones.image'], ['zones.frame', 'send.frame']],
  ui: { cap: { x: 40, y: 80 }, zones: { x: 340, y: 80 }, send: { x: 640, y: 80 }, viewport: { x: 1, y: 2 } } as never,
})
