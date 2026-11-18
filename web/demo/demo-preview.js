// The editor's preview stream on the engine (Aurora-51nv.10). Streams are the provider
// for demo-eventsource.js, and the room's tick carries their previewSnapshot steps.
import { validSession } from './demo-drafts.js';
import { inputsFromVerdict } from './engine-feeds.js';

const LAYOUTS = ['lights', 'room', 'basic'];

export function createPreviewHub({ engine, drafts }) {
  const open = new Map(); // session -> entry

  function fail(sink, error, message = '') {
    sink.emit('error', { error, message });
    sink.end();
  }

  function release(entry, { closeEngine }) {
    if (entry.done) return;
    entry.done = true;
    entry.off?.();
    if (open.get(entry.session) === entry) {
      open.delete(entry.session);
      if (closeEngine) engine.closePreview(entry.session);
    }
  }

  async function start(entry, query) {
    const { session, sink } = entry;
    const doc = drafts.get(session);
    const layout = query.get('layout');
    const refusal = !validSession(session) ? 'invalid_session'
      : layout !== null && !LAYOUTS.includes(layout) ? 'invalid_layout'
      : !doc ? 'no_draft'
      : null;
    if (refusal) return fail(sink, refusal);

    const previous = open.get(session);
    open.set(session, entry);
    if (previous) {
      previous.sink.emit('ended', { reason: 'replaced' });
      release(previous, { closeEngine: false });
      previous.sink.end();
    }
    const opened = await engine.openPreview(session, doc, layout ?? 'lights');
    if (entry.done) return;
    if (opened?.error) {
      release(entry, { closeEngine: false });
      return fail(sink, opened.error, opened.message ?? '');
    }
    entry.inputs = inputsFromVerdict(await engine.validate(doc), doc);
    entry.loaded = JSON.stringify(doc);
    entry.live = true;

    // Each draft change reloads the preview in place, one at a time.
    let chain = Promise.resolve();
    entry.off = drafts.onChange(session, () => {
      chain = chain.then(() => reload(entry));
    });
  }

  async function reload(entry) {
    if (entry.done) return;
    const doc = drafts.get(entry.session);
    if (!doc) {
      entry.sink.emit('ended', { reason: 'draft_deleted' });
      release(entry, { closeEngine: true });
      entry.sink.end();
      return;
    }
    const key = JSON.stringify(doc);
    if (key === entry.loaded) return;
    entry.loaded = key;
    const result = await engine.reloadPreview(entry.session, doc);
    if (entry.done) return;
    if (result?.error) {
      if (result.message !== entry.lastError) {
        entry.lastError = result.message;
        entry.sink.emit('error', { error: 'draft_invalid', message: result.message ?? '' });
      }
      return;
    }
    entry.lastError = null;
    entry.inputs = inputsFromVerdict(await engine.validate(doc), doc);
  }

  return {
    // /api/graph/preview?session=&layout= ; anything else is not a stream.
    streams(path, query) {
      if (path !== '/api/graph/preview') return null;
      const entry = { session: query.get('session') ?? '', sink: null, done: false, live: false, inputs: { video: false, audio: false }, lastKey: null, lastError: null };
      return {
        subscribe(sink) {
          entry.sink = sink;
          start(entry, query).catch((error) => {
            release(entry, { closeEngine: false });
            fail(sink, 'cannot_preview', String(error?.message ?? error));
          });
          return undefined;
        },
        close: () => release(entry, { closeEngine: true }),
      };
    },

    // The room's per-tick steps and what they read.
    steps: () => [...open.values()].filter((e) => e.live).map((e) => ['previewSnapshot', [e.session]]),
    inputs() {
      const need = { video: false, audio: false };
      for (const entry of open.values()) {
        need.video = need.video || entry.inputs.video;
        need.audio = need.audio || entry.inputs.audio;
      }
      return need;
    },
    // results line up with the steps() the batch was built from.
    onResults(results, steps) {
      steps.forEach(([, [session]], i) => {
        const entry = open.get(session);
        const snapshot = results[i];
        if (!entry || entry.done || !snapshot || snapshot.error) return;
        const { tickMs: _tickMs, ...key } = snapshot;
        const text = JSON.stringify(key);
        if (text === entry.lastKey) return;
        entry.lastKey = text;
        entry.sink.emit('preview', snapshot);
      });
    },
    openSessions: () => [...open.keys()],
  };
}
