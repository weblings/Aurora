// Main-thread client for engine-worker.js: one promise per call, typed-array buffers transferred.
import { ENGINE_CALLS } from './engine-host.js';

function transferables(value, found = new Set()) {
  if (ArrayBuffer.isView(value)) found.add(value.buffer);
  else if (Array.isArray(value)) value.forEach((item) => transferables(item, found));
  return found;
}

export function createEngineClient(worker) {
  const pending = new Map();
  let nextId = 1;
  let settleReady;
  const ready = new Promise((resolve, reject) => { settleReady = { resolve, reject }; });
  ready.catch(() => {}); // callers that never await it must not trip unhandledrejection

  function failAll(message) {
    settleReady.reject(new Error(message));
    for (const { reject } of pending.values()) reject(new Error(message));
    pending.clear();
  }

  worker.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg?.type === 'ready') return settleReady.resolve();
    if (msg?.type === 'fatal') return failAll(msg.message);
    const slot = pending.get(msg?.id);
    if (!slot) return;
    pending.delete(msg.id);
    slot.resolve(msg.result);
  });
  worker.addEventListener('error', (event) => failAll(event?.message || 'engine worker failed'));

  function call(name, args = []) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, call: name, args }, [...transferables(args)]);
    });
  }

  const client = { ready, call, batch: (steps) => call('batch', [steps]) };
  for (const name of ENGINE_CALLS) client[name] = (...args) => call(name, args);
  return client;
}

export function spawnEngineClient() {
  return createEngineClient(new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' }));
}
