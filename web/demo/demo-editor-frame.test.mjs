import assert from 'node:assert/strict';
import { installEditorStandIns, installFromParent } from './demo-editor-frame.js';

// A frame stand-in: its own Response and URL, a native fetch that records pass-throughs.
function makeFrame() {
  const passed = [];
  class FrameResponse extends Response {}
  const win = {
    URL,
    Response: FrameResponse,
    fetch: async (input) => { passed.push(input); return new Response('native'); },
    EventSource: class NativeEventSource { constructor(url) { this.url = url; } },
  };
  win.parent = win;
  return { win, passed };
}

const calls = [];
const handle = {
  route: async (method, path, body) => {
    calls.push([method, path, body]);
    return path === '/api/missing' ? { status: 404, json: { error: 'nope' } } : { status: 200, json: { ok: true, path } };
  },
  streams: (path) => (path === '/api/graph/preview'
    ? { subscribe(sink) { sink.emit('preview', { n: 1 }); }, close() {} }
    : null),
};

{
  const { win, passed } = makeFrame();
  const uninstall = installEditorStandIns(win, handle);

  const res = await win.fetch('/api/effects?x=1');
  assert.ok(res instanceof win.Response);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, path: '/api/effects' });
  assert.equal(res.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(calls.at(-1), ['GET', '/api/effects', '']);

  await win.fetch('/api/effects/a/title', { method: 'put', body: '{"title":"T"}' });
  assert.deepEqual(calls.at(-1), ['PUT', '/api/effects/a/title', '{"title":"T"}']);

  await win.fetch(new Request('http://x.test/api/ignored'));
  assert.equal(passed.length, 1, 'absolute URLs are not /api/ paths and pass through');
  assert.equal((await win.fetch('/api/missing')).status, 404);
  assert.equal(await (await win.fetch('./assets/a.js')).text(), 'native');
  assert.equal(passed.at(-1), './assets/a.js');

  // EventSource: /api/ goes to the streams provider, other URLs to the native class.
  const events = [];
  const es = new win.EventSource('/api/graph/preview?session=s1');
  es.addEventListener('preview', (e) => events.push(JSON.parse(e.data)));
  await Promise.resolve();
  assert.deepEqual(events, [{ n: 1 }]);
  es.close();
  assert.equal(new win.EventSource('/other').url, '/other');

  uninstall();
  assert.equal(await (await win.fetch('/api/effects')).text(), 'native');
  assert.equal(win.EventSource.name, 'NativeEventSource');
}

{
  const { win } = makeFrame();
  assert.equal(installFromParent(win), null, 'unframed page installs nothing');
  const plain = win.fetch;
  assert.equal(win.fetch, plain);
  win.parent = { auroraDemo: handle };
  const uninstall = installFromParent(win);
  assert.equal(typeof uninstall, 'function');
  assert.equal((await win.fetch('/api/x')).status, 200);
}

console.log('demo-editor-frame tests passed.');
