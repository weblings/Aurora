// Effect list state for the demo shim: custom effects plus hidden and order,
// persisted in storage like the app's effects folder and config (Aurora-51nv.9).
// Mirrors core's EffectsRoutes ordering: built-ins lead, each group in saved order.

import { modeFromConfig } from './vendor/webui/CaptureSource.js';
import { inputsOfGraph, BUILTIN_INPUTS } from './engine-feeds.js';

const KEY = 'aurora-demo-effects';
export const BUILTIN_IDS = ['builtin.video', 'builtin.audio'];

// The built-ins' fixed picker text, as the backend's effectInfo (Aurora-mfud).
export const BUILTIN_EFFECTS = [
  { id: 'builtin.video', builtin: true, title: 'Screen colors', description: 'Follows the colors on your screen.' },
  { id: 'builtin.audio', builtin: true, title: 'Music pulse', description: 'Moves with the sound your computer is playing.' },
];

// The effect the room runs: the saved choice when it still exists, else the built-in the mode names.
export function activeEffectId(config, effects) {
  const id = config?.activeEffectId;
  if (typeof id === 'string' && id !== '' && effects.exists(id)) return id;
  return modeFromConfig(config) === 'audio' ? 'builtin.audio' : 'builtin.video';
}

// {title, description} of any effect in the list's words.
export function effectText(effects, id) {
  const info = effects.isBuiltin(id) ? BUILTIN_EFFECTS.find((e) => e.id === id) : effects.getCustom(id);
  return { title: info?.title ?? id, description: info?.description || '' };
}
const MAX_TITLE = 80;

export function validEffectId(id) {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id);
}

const isInputs = (v) => typeof v?.video === 'boolean' && typeof v?.audio === 'boolean';
const strings = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []);

function load(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return { custom: {}, inputs: {}, hidden: [], order: [] };
    const custom = {};
    for (const [id, doc] of Object.entries(parsed.custom ?? {})) {
      if (validEffectId(id) && doc && typeof doc === 'object') custom[id] = doc;
    }
    const inputs = {};
    for (const [id, found] of Object.entries(parsed.inputs ?? {})) {
      if (Object.hasOwn(custom, id) && isInputs(found)) inputs[id] = { video: found.video, audio: found.audio };
    }
    return { custom, inputs, hidden: strings(parsed.hidden), order: strings(parsed.order) };
  } catch {
    return { custom: {}, inputs: {}, hidden: [], order: [] };
  }
}

// Ids in saved order first, the rest after in their given order.
function ordered(ids, saved) {
  const out = saved.filter((id, i) => ids.includes(id) && saved.indexOf(id) === i);
  return out.concat(ids.filter((id) => !out.includes(id)));
}

export function createEffectsStore(storage) {
  const state = load(storage);
  const persist = () => {
    try {
      storage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Session-only from here on, never fatal.
    }
  };
  const isBuiltin = (id) => BUILTIN_IDS.includes(id);
  const exists = (id) => isBuiltin(id) || Object.hasOwn(state.custom, id);
  const displayOrder = () => [
    ...ordered(BUILTIN_IDS, state.order),
    ...ordered(Object.keys(state.custom).sort(), state.order),
  ];

  return {
    isBuiltin,
    exists,
    isCustom: (id) => Object.hasOwn(state.custom, id),
    displayOrder,
    isHidden: (id) => state.hidden.includes(id),
    getCustom: (id) => (Object.hasOwn(state.custom, id) ? state.custom[id] : null),
    // The capture inputs an effect reads: a built-in's fixed pair, a custom effect's stored pair.
    getInputs(id) {
      if (id === 'builtin.video') return { ...BUILTIN_INPUTS.video };
      if (id === 'builtin.audio') return { ...BUILTIN_INPUTS.audio };
      if (!Object.hasOwn(state.custom, id)) return null;
      return state.inputs[id] ?? inputsOfGraph(state.custom[id]);
    },
    // Save a custom graph document under id (the editor's save route and test seeds use this).
    // `inputs` is what the engine said the graph reads, else it is read from the nodes.
    putCustom(id, doc, inputs = null) {
      if (!validEffectId(id) || isBuiltin(id)) return false;
      const isNew = !Object.hasOwn(state.custom, id);
      state.custom[id] = doc;
      if (isInputs(inputs)) state.inputs[id] = { video: inputs.video, audio: inputs.audio };
      else delete state.inputs[id];
      if (isNew) state.order = [...displayOrder().filter((e) => e !== id), id];
      persist();
      return true;
    },
    setHidden(id, hidden) {
      state.hidden = state.hidden.filter((e) => e !== id);
      if (hidden) state.hidden.push(id);
      persist();
    },
    // One step among the visible effects of the same group, as core's move route.
    move(id, step) {
      const ids = displayOrder();
      const builtin = isBuiltin(id);
      const from = ids.indexOf(id);
      let to = from + step;
      while (to >= 0 && to < ids.length && isBuiltin(ids[to]) === builtin && state.hidden.includes(ids[to])) to += step;
      if (to < 0 || to >= ids.length || isBuiltin(ids[to]) !== builtin) return false;
      ids.splice(from, 1);
      ids.splice(to, 0, id);
      state.order = ids;
      persist();
      return true;
    },
    // Trimmed title, 80 characters at most. Returns the stored title or null if invalid.
    rename(id, title) {
      const trimmed = String(title).trim();
      if (!trimmed || [...trimmed].length > MAX_TITLE) return null;
      state.custom[id] = { ...state.custom[id], title: trimmed };
      persist();
      return trimmed;
    },
    remove(id) {
      delete state.custom[id];
      delete state.inputs[id];
      state.hidden = state.hidden.filter((e) => e !== id);
      state.order = state.order.filter((e) => e !== id);
      persist();
    },
  };
}
