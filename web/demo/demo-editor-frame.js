// Stand-ins installed inside the editor iframe (Aurora-51nv.9). The frame is
// same origin, so /api/ fetches and EventSources call the parent's demo handle
// directly. Handle: {route(method, path, rawBody) => Promise<{status, json}>, streams}.
import { installEventSourceStandIn } from './demo-eventsource.js';

async function readBody(input, init) {
  if (init.body !== undefined && init.body !== null) return String(init.body);
  if (typeof input === 'object' && input && typeof input.text === 'function') return input.text();
  return '';
}

// Returns an uninstall function. Non-/api/ URLs fall through to the native fetch.
export function installEditorStandIns(win, handle) {
  const nativeFetch = win.fetch.bind(win);
  win.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof win.URL ? input.href : input.url;
    if (!url.startsWith('/api/')) return nativeFetch(input, init);
    const method = String(init.method ?? input?.method ?? 'GET').toUpperCase();
    const body = await readBody(input, init);
    const result = await handle.route(method, url.split('?')[0], body);
    // Built in the frame's realm so the editor's instanceof checks hold.
    return new win.Response(JSON.stringify(result.json), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const uninstallEventSource = installEventSourceStandIn(win, handle.streams);
  return () => {
    win.fetch = nativeFetch;
    uninstallEventSource();
  };
}

// Frame entry: wires the stand-ins when a demo page hosts the frame.
export function installFromParent(win) {
  const handle = win.parent !== win ? win.parent.auroraDemo : null;
  return handle ? installEditorStandIns(win, handle) : null;
}
