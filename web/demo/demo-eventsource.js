// EventSource stand-in for the demo editor (Aurora-51nv.2). /api/ streams come
// from a `streams` provider, other URLs fall through to the native EventSource.
//
// Provider contract: streams(path, query: URLSearchParams) returns null (an
// unknown stream, a 404 to the page) or {subscribe(sink), close()}.
// sink.emit(name, data) sends one SSE event (an object is JSON.stringified, a
// string passes as is) and sink.end() drops the connection. subscribe may
// return an unsubscribe function. close() runs once when the page closes.

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

function makeEvent(type, data, target) {
  const e = { type, target, currentTarget: target, lastEventId: '', origin: '', ports: [] };
  if (data !== undefined) e.data = data;
  return e;
}

export function createEventSourceStandIn(streams, nativeEventSource = null) {
  class DemoEventSource {
    static CONNECTING = CONNECTING;
    static OPEN = OPEN;
    static CLOSED = CLOSED;
    CONNECTING = CONNECTING;
    OPEN = OPEN;
    CLOSED = CLOSED;

    constructor(url, init = {}) {
      const text = String(url);
      if (!text.startsWith('/api/')) {
        if (!nativeEventSource) throw new TypeError('DemoEventSource: no native EventSource for ' + text);
        return new nativeEventSource(url, init);
      }
      this.url = text;
      this.withCredentials = !!init.withCredentials;
      this.readyState = CONNECTING;
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
      this._listeners = new Map();
      this._stream = null;
      this._unsubscribe = null;
      // Connect on a later tick so callers can attach handlers first.
      queueMicrotask(() => this._connect());
    }

    _connect() {
      if (this.readyState === CLOSED) return;
      const cut = this.url.indexOf('?');
      const path = cut < 0 ? this.url : this.url.slice(0, cut);
      const query = new URLSearchParams(cut < 0 ? '' : this.url.slice(cut + 1));
      let stream = null;
      try {
        stream = streams(path, query);
      } catch {
        stream = null;
      }
      if (!stream) {
        // A non-200 response fails the connection for good, with no data on the event.
        this.readyState = CLOSED;
        this._fire('error');
        return;
      }
      this._stream = stream;
      this.readyState = OPEN;
      this._fire('open');
      if (this.readyState === CLOSED) return;
      const sink = {
        emit: (name, data) => {
          if (this.readyState !== OPEN) return;
          this._fire(name, typeof data === 'string' ? data : JSON.stringify(data));
        },
        end: () => {
          if (this.readyState !== OPEN) return;
          this._release();
          this.readyState = CLOSED;
          this._fire('error');
        },
      };
      const off = stream.subscribe(sink);
      if (this.readyState === CLOSED) {
        if (typeof off === 'function') off();
      } else if (typeof off === 'function') {
        this._unsubscribe = off;
      }
    }

    _fire(type, data) {
      const event = makeEvent(type, data, this);
      const handler = type === 'open' ? this.onopen : type === 'error' ? this.onerror : type === 'message' ? this.onmessage : null;
      if (typeof handler === 'function') handler.call(this, event);
      for (const fn of [...(this._listeners.get(type) ?? [])]) {
        if (this.readyState === CLOSED && type !== 'error') break;
        fn.call(this, event);
      }
    }

    addEventListener(type, fn) {
      if (typeof fn !== 'function') return;
      const list = this._listeners.get(type) ?? [];
      if (!list.includes(fn)) list.push(fn);
      this._listeners.set(type, list);
    }

    removeEventListener(type, fn) {
      const list = this._listeners.get(type);
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }

    _release() {
      const off = this._unsubscribe;
      const stream = this._stream;
      this._unsubscribe = null;
      this._stream = null;
      if (typeof off === 'function') off();
      if (stream && typeof stream.close === 'function') stream.close();
    }

    close() {
      if (this.readyState === CLOSED) return;
      this.readyState = CLOSED;
      this._release();
    }
  }
  return DemoEventSource;
}

// Replaces win.EventSource and returns an uninstall function.
export function installEventSourceStandIn(win, streams) {
  const native = win.EventSource ?? null;
  win.EventSource = createEventSourceStandIn(streams, native);
  return () => {
    if (native) win.EventSource = native;
    else delete win.EventSource;
  };
}

const SESSION_OK = /^[A-Za-z0-9_-]{1,64}$/;

// Stub provider: /api/graph/preview?session=... streams animated frames in the
// server's shape, until the engine-backed provider replaces it (Aurora-51nv.10).
export function createStubStreams(options = {}) {
  const intervalMs = options.intervalMs ?? 100;
  const setTimer = options.setInterval ?? setInterval;
  const clearTimer = options.clearInterval ?? clearInterval;
  const zoneCount = options.zones ?? 4;
  const known = options.knownSessions ?? null;
  return (path, query) => {
    if (path !== '/api/graph/preview') return null;
    const session = query.get('session') ?? '';
    const layout = query.get('layout');
    const refusal = !SESSION_OK.test(session) ? 'invalid_session'
      : layout !== null && !['room', 'basic'].includes(layout) ? 'invalid_layout'
      : known && !known.has(session) ? 'no_draft'
      : null;
    let timer = null;
    const stop = () => { if (timer !== null) { clearTimer(timer); timer = null; } };
    return {
      subscribe(sink) {
        if (refusal) {
          sink.emit('error', { error: refusal, message: '' });
          sink.end();
          return undefined;
        }
        let tick = 0;
        const send = () => {
          const zones = [];
          for (let id = 0; id < zoneCount; id++) {
            const h = ((tick * 0.01 + id / zoneCount) % 1) * 2 * Math.PI;
            zones.push({
              b: 0.5 + 0.5 * Math.sin(h + 4.19),
              error: false,
              g: 0.5 + 0.5 * Math.sin(h + 2.09),
              id,
              r: 0.5 + 0.5 * Math.sin(h),
            });
          }
          sink.emit('preview', { errors: [], outputs: [{ output: 'hue', zones }], session, tickMs: 0 });
          tick++;
        };
        send();
        timer = setTimer(send, intervalMs);
        return stop;
      },
      close: stop,
    };
  };
}
