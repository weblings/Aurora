// Config -> engine graph mapping. The built-in graph documents carry a `controls`
// list (config key -> node param), so a tuning PUT becomes new param values in the
// document handed to loadLive. Pure and tested (demo-tuning.test.mjs).

import { modeFromConfig } from './vendor/webui/CaptureSource.js';
import { BUILTIN_GRAPHS } from './builtin-graphs.js';
import { BUILTIN_INPUTS } from './engine-feeds.js';
import { activeEffectId } from './demo-effects.js';

// Keys that round-trip through the shim store (the Dashboard displays them
// back) but have no demo effect. Each entry says why: a slider that moves
// yet changes nothing must be a listed decision, never an accident.
export const NO_OP_KEYS = {
  refreshRate: 'daemon tick rate; the scene runs on rAF',
  activeMonitorName: 'no capture device in the demo (displayed back only)',
  audioTargetSinkName: 'no capture device in the demo (displayed back only)',
};

// Config spells an unset optional float as a negative number, the graph as null.
// subsampleWidth 0 means derive natively, so the document keeps its own default width.
function controlValue(control, config) {
  const value = config[control.config];
  if (value === undefined) return undefined;
  if (control.param === 'width' && value <= 0) return undefined;
  if (control.param === 'fixedAnchorHue' && value < 0) return null;
  return value;
}

export function buildGraphDoc(mode, config) {
  const base = BUILTIN_GRAPHS[mode === 'audio' ? 'audio' : 'video'];
  const doc = JSON.parse(JSON.stringify(base));
  for (const control of doc.controls ?? []) {
    const node = doc.nodes.find((n) => n.id === control.node);
    const value = node && controlValue(control, config);
    if (node && value !== undefined) node.params[control.param] = value;
  }
  return doc;
}

// The graph the room runs: the active custom effect as saved, else the built-in the config names.
// `effects` is the shim's effects store. `inputs` is what the room must feed it.
export function configToEngine(config, effects = null) {
  const id = effects ? activeEffectId(config, effects) : null;
  if (id && effects.isCustom(id)) {
    return { mode: 'custom', id, doc: effects.getCustom(id), inputs: effects.getInputs(id) };
  }
  const mode = modeFromConfig(config);
  return { mode, id: `builtin.${mode}`, doc: buildGraphDoc(mode, config), inputs: BUILTIN_INPUTS[mode] };
}
