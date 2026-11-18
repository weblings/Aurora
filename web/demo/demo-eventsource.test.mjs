// Node tests for the demo EventSource stand-in (no DOM, no framework).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEventSourceStandIn, installEventSourceStandIn, createStubStreams } from './demo-eventsource.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const sample = (n) => JSON.parse(readFileSync(new URL(`../graph-editor/src/graph/server-samples/${n}.json`, import.meta.url), 'utf8'));
const keys = (o) => Object.keys(o).sort();

function fakeProvider() {
  const log = { opened: [], sinks: [], unsub: 0, closed: 0 };
  const streams = (path, query) => {
    if (path !== '/api/graph/preview') return null;
    log.opened.push([path, query.get('session')]);
    return { subscribe(sink) { log.sinks.push(sink); return () => { log.unsub++; }; }, close() { log.closed++; } };
  };
  return { streams, log };
}

// Constants, fields, handlers, close.
{
  const { streams, log } = fakeProvider();
  const ES = createEventSourceStandIn(streams);
  assert.deepEqual([ES.CONNECTING, ES.OPEN, ES.CLOSED], [0, 1, 2]);
  const es = new ES('/api/graph/preview?session=abc');
  assert.equal(es.url, '/api/graph/preview?session=abc');
  assert.equal(es.withCredentials, false);
  assert.equal(es.readyState, 0);
  const seen = [];
  es.onopen = (e) => seen.push(['open', e.type, es.readyState]);
  es.onmessage = (e) => seen.push(['message', e.data]);
  es.addEventListener('preview', (e) => seen.push(['preview', e.data, typeof e.data]));
  const removed = () => seen.push(['removed']);
  es.addEventListener('preview', removed);
  es.removeEventListener('preview', removed);
  await tick();
  assert.deepEqual(log.opened, [['/api/graph/preview', 'abc']]);
  assert.equal(es.readyState, 1);
  log.sinks[0].emit('preview', { a: 1 });
  log.sinks[0].emit('message', 'hi');
  assert.deepEqual(seen, [['open', 'open', 1], ['preview', '{"a":1}', 'string'], ['message', 'hi']]);
  es.close();
  es.close();
  log.sinks[0].emit('preview', {});
  assert.equal(seen.length, 3);
  assert.equal(es.readyState, 2);
  assert.deepEqual([log.unsub, log.closed], [1, 1]);
}

// Closing before the connect tick never opens the stream.
{
  const { streams, log } = fakeProvider();
  const es = new (createEventSourceStandIn(streams))('/api/graph/preview?session=x');
  es.close();
  await tick();
  assert.equal(log.opened.length, 0);
}

// An unknown /api/ stream errors like a 404: bare error, CLOSED, no open.
{
  const { streams } = fakeProvider();
  const es = new (createEventSourceStandIn(streams))('/api/nope');
  const seen = [];
  es.onopen = () => seen.push('open');
  es.addEventListener('error', (e) => seen.push(['error', e.data, es.readyState]));
  await tick();
  assert.deepEqual(seen, [['error', undefined, 2]]);
}

// A provider that throws is treated as unknown.
{
  const es = new (createEventSourceStandIn(() => { throw new Error('x'); }))('/api/graph/preview?session=a');
  let errors = 0;
  es.onerror = () => errors++;
  await tick();
  assert.equal(errors, 1);
  assert.equal(es.readyState, 2);
}

// A handler that closes on ended gets no further events, not even the end() error.
{
  const { streams, log } = fakeProvider();
  const es = new (createEventSourceStandIn(streams))('/api/graph/preview?session=a');
  const seen = [];
  es.addEventListener('ended', () => { seen.push('ended'); es.close(); });
  es.addEventListener('error', () => seen.push('error'));
  await tick();
  log.sinks[0].emit('ended', { reason: 'pipeline_gone' });
  log.sinks[0].end();
  assert.deepEqual(seen, ['ended']);
  assert.deepEqual([log.unsub, log.closed], [1, 1]);
}

// Non-/api URLs fall through to the native class.
{
  class Native { constructor(u, i) { this.u = u; this.i = i; } }
  const ES = createEventSourceStandIn(() => null, Native);
  const es = new ES('https://example.com/feed', { withCredentials: true });
  assert.ok(es instanceof Native);
  assert.deepEqual([es.u, es.i.withCredentials], ['https://example.com/feed', true]);
}

// install/uninstall swap win.EventSource.
{
  class Native {}
  const win = { EventSource: Native };
  const off = installEventSourceStandIn(win, () => null);
  assert.notEqual(win.EventSource, Native);
  off();
  assert.equal(win.EventSource, Native);
}

// Stub provider: frames match the server sample's shape, refusals match the server's error event.
{
  const ES = createEventSourceStandIn(createStubStreams({ intervalMs: 5 }));
  const es = new ES('/api/graph/preview?session=editor-1');
  const frames = [];
  es.addEventListener('preview', (e) => frames.push(JSON.parse(e.data)));
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(frames.length >= 2, 'stream keeps emitting');
  const snap = sample('preview-snapshot');
  const f = frames[0];
  assert.deepEqual(keys(f), keys(snap));
  assert.deepEqual(keys(f.outputs[0]), keys(snap.outputs[0]));
  assert.deepEqual(keys(f.outputs[0].zones[0]), keys(snap.outputs[0].zones[0]));
  assert.equal(f.session, 'editor-1');
  assert.equal(f.outputs[0].output, 'hue');
  for (const z of f.outputs[0].zones) for (const c of [z.r, z.g, z.b]) assert.ok(c >= 0 && c <= 1);
  es.close();
  const n = frames.length;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(frames.length, n, 'no frames after close');

  for (const [url, error] of [
    ['/api/graph/preview', 'invalid_session'],
    ['/api/graph/preview?session=a&layout=zzz', 'invalid_layout'],
  ]) {
    const bad = new ES(url);
    const got = [];
    bad.addEventListener('error', (e) => got.push(e.data === undefined ? 'bare' : JSON.parse(e.data)));
    await tick();
    assert.deepEqual(got, [{ error, message: '' }, 'bare']);
    assert.equal(bad.readyState, 2);
  }
  const ES2 = createEventSourceStandIn(createStubStreams({ knownSessions: new Set() }));
  const e3 = new ES2('/api/graph/preview?session=a');
  const got = [];
  e3.addEventListener('error', (e) => got.push(e.data));
  await tick();
  assert.deepEqual(JSON.parse(got[0]), { error: 'no_draft', message: '' });
}

console.log('demo-eventsource tests passed');
