// Module Worker around web/engine/engine.js. The wasm module is copied in by
// vendor/fetch-engine.py (gitignored), so a missing file reports {type:'fatal'}.
import { wrapEngine } from '../engine/engine.js';
import { createEngineHost } from './engine-host.js';

let handle = null;
const booted = (async () => {
  const { default: createAuroraEngine } = await import('./vendor/engine/aurora-engine.mjs');
  handle = createEngineHost(wrapEngine(await createAuroraEngine()));
  self.postMessage({ type: 'ready' });
})().catch((error) => self.postMessage({ type: 'fatal', message: String(error?.message ?? error) }));

self.onmessage = async (event) => {
  await booted;
  if (handle) self.postMessage(handle(event.data));
};
