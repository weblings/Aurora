// Tuning renders the graph's `controls` (Aurora-id8j.10). Pure logic, no DOM:
// run with `node TuningControls.test.mjs`.
import assert from 'node:assert/strict';
import { fetchTuningGraph, groupBySection, resolveControls } from './TuningControls.js';
import { buildPatch, slidersFromControls } from './TuningFields.js';

const nodeTypes = [
  {
    type: 'image.rescale',
    params: [
      { name: 'width', kind: 'float', label: 'Resample width', min: 0, max: 7680, step: 1, unit: 'px', default: 0 },
      { name: 'interpolation', kind: 'enum', options: ['Nearest', 'Cubic', 'Area'], default: 'Area' },
    ],
  },
  {
    type: 'audio.drift',
    params: [
      { name: 'fixedAnchorHue', kind: 'optional-float', label: 'Fixed hue', min: 0, max: 360, step: 1, unit: '°', default: -1, allowsUnset: true },
      { name: 'ramp', kind: 'gradient', default: [] },
    ],
  },
  { type: 'math.add', params: [{ name: 'amount', kind: 'float', label: 'Amount', min: 0, max: 1, step: 0.1, unit: '', default: 0.5 }] },
];

const graph = {
  nodes: [
    { id: 'rescale', type: 'image.rescale', params: { width: 96, interpolation: 'Cubic' } },
    { id: 'drift', type: 'audio.drift', params: { fixedAnchorHue: null } },
    { id: 'plus', type: 'math.add', params: {} },
  ],
  controls: [
    { node: 'rescale', param: 'width', config: 'subsampleWidth' },
    { node: 'rescale', param: 'interpolation', config: 'interpolation' },
    { node: 'drift', param: 'fixedAnchorHue', config: 'audioFixedAnchorHue', section: 'Color character' },
    { node: 'drift', param: 'ramp' },
    { node: 'ghost', param: 'x' },
    { node: 'plus', param: 'amount', label: 'Mix', section: 'Agent' },
  ],
};

// Order follows the graph. Gradient and unknown nodes are skipped. Values come
// from the node's stored params, else the schema default.
{
  const controls = resolveControls(graph, nodeTypes);
  assert.deepEqual(controls.map((c) => c.id), ['rescale-width', 'rescale-interpolation', 'drift-fixedAnchorHue', 'plus-amount']);
  assert.equal(controls[0].configKey, 'subsampleWidth');
  assert.equal(controls[0].value, 96);
  assert.equal(controls[0].unit, 'px');
  assert.deepEqual(controls[1].options, ['Nearest', 'Cubic', 'Area']);
  assert.equal(controls[2].allowsUnset, true);
  assert.equal(controls[3].configKey, null);
  assert.equal(controls[3].label, 'Mix');
  assert.equal(controls[3].value, 0.5);
}

// An edited graph's controls appear with no UI change: same code, new list.
{
  const edited = { ...graph, controls: [{ node: 'plus', param: 'amount' }] };
  assert.deepEqual(resolveControls(edited, nodeTypes).map((c) => c.id), ['plus-amount']);
  assert.deepEqual(resolveControls({ nodes: [] }, nodeTypes), []);
  assert.deepEqual(resolveControls(null, nodeTypes), []);
}

// Only consecutive controls of one section group together.
{
  const groups = groupBySection(resolveControls(graph, nodeTypes));
  assert.deepEqual(groups.map((g) => [g.section, g.controls.length]), [['', 2], ['Color character', 1], ['Agent', 1]]);
}

// Slider tuples keep sliderGroupHtml's order and key by config key, else id.
{
  const controls = resolveControls(graph, nodeTypes);
  assert.deepEqual(slidersFromControls([controls[2], controls[3]]), [
    ['audioFixedAnchorHue', 'Fixed hue', 0, 360, 1, '°'],
    ['plus-amount', 'Mix', 0, 1, 0.1, ''],
  ]);
}

// Patch: config-bound controls only, optional-off sends -1, refresh rate on request.
{
  const controls = resolveControls(graph, nodeTypes);
  const values = { refreshRate: 60, subsampleWidth: '96', interpolation: 'Cubic', audioFixedAnchorHue: 120, 'plus-amount': 0.5 };
  assert.deepEqual(buildPatch(controls, values, { audioFixedAnchorHue: true }, { includeRefreshRate: true }), {
    refreshRate: 60, subsampleWidth: 96, interpolation: 'Cubic', audioFixedAnchorHue: 120,
  });
  assert.equal(buildPatch(controls, values, { audioFixedAnchorHue: false }, { includeRefreshRate: false }).audioFixedAnchorHue, -1);
  assert.equal('refreshRate' in buildPatch(controls, values, {}, { includeRefreshRate: false }), false);
}

// Fetch: both routes, or null when the graph is null (no pipeline) or a route fails.
{
  const route = (graphBody, nodesBody) => async (url) => ({ json: async () => (url === '/api/graph' ? graphBody : nodesBody) });
  assert.deepEqual(await fetchTuningGraph(route({ graph }, { nodes: nodeTypes })), { graph, nodeTypes });
  assert.equal(await fetchTuningGraph(route({ graph: null }, { nodes: nodeTypes })), null);
  assert.equal(await fetchTuningGraph(route({ graph }, { succeeded: false, error: 'unknown_route' })), null);
  assert.equal(await fetchTuningGraph(async () => { throw new Error('down'); }), null);
}

console.log('TuningControls.test.mjs: ok');
