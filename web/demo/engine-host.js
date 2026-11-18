// Worker-side dispatcher for the WASM engine: {id, call, args} in, {id, result} out.
// Calls mirror web/engine/engine.js, so a new engine call needs no protocol change.

export const ENGINE_CALLS = [
  'init', 'setZones', 'nodes', 'validate', 'loadLive', 'openPreview', 'reloadPreview',
  'closePreview', 'feedVideo', 'feedAudio', 'step', 'liveColors', 'previewSnapshot',
];

// 'batch' runs [[call, args], ...] in order and answers with the result array (one round trip per tick).
export function createEngineHost(engine) {
  function run(call, args) {
    if (!ENGINE_CALLS.includes(call)) return { error: 'unknown_call', message: String(call) };
    try {
      return engine[call](...(args ?? []));
    } catch (error) {
      return { error: 'engine_exception', message: String(error?.message ?? error) };
    }
  }

  return function handle({ id, call, args }) {
    if (call === 'batch') {
      const steps = Array.isArray(args?.[0]) ? args[0] : [];
      return { id, result: steps.map(([stepCall, stepArgs]) => run(stepCall, stepArgs)) };
    }
    return { id, result: run(call, args) };
  };
}
