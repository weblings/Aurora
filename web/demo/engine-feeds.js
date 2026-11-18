// Which inputs the room feeds the engine, decided from the active graph.
// Built-ins are fixed. Custom effects (Aurora-51nv.10) pass the graph's inputs field.

const NODE_INPUT = { 'video.capture': 'video', 'audio.capture': 'audio' };

export function inputsOfGraph(doc) {
  const inputs = { video: false, audio: false };
  for (const node of doc?.nodes ?? []) {
    const kind = NODE_INPUT[node.type];
    if (kind) inputs[kind] = true;
  }
  return inputs;
}

export const BUILTIN_INPUTS = {
  video: { video: true, audio: false },
  audio: { video: false, audio: true },
};

// The inputs a validated graph reads: the engine's own answer when it has one.
export function inputsFromVerdict(verdict, doc) {
  const found = verdict?.inputs;
  if (typeof found?.video === 'boolean' && typeof found?.audio === 'boolean') {
    return { video: found.video, audio: found.audio };
  }
  // Aurora-51nv.10: fallback until the CI module returns inputs from validate. Delete then.
  return inputsOfGraph(doc);
}
