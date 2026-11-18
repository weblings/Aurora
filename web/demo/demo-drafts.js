// The editor's draft sessions, as core's DraftStore: one graph per session id,
// a count and size cap, idle drafts evicted (Aurora-51nv.10).

export const DRAFT_LIMITS = { maxDrafts: 16, maxBytes: 256 * 1024, idleSeconds: 3600 };

export function validSession(session) {
  return typeof session === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(session);
}

// clock() returns seconds. put() answers 'saved', 'invalid_session', 'draft_too_large' or 'too_many_drafts'.
export function createDraftStore({ limits = DRAFT_LIMITS, clock = () => Date.now() / 1000 } = {}) {
  const drafts = new Map();
  const listeners = new Map();

  const evictIdle = () => {
    const now = clock();
    for (const [session, entry] of drafts) {
      if (now - entry.lastUsed > limits.idleSeconds) drafts.delete(session);
    }
  };
  const tell = (session) => {
    for (const fn of [...(listeners.get(session) ?? [])]) fn();
  };

  return {
    put(session, doc) {
      if (!validSession(session)) return 'invalid_session';
      if (JSON.stringify(doc).length > limits.maxBytes) return 'draft_too_large';
      evictIdle();
      if (!drafts.has(session) && drafts.size >= limits.maxDrafts) return 'too_many_drafts';
      drafts.set(session, { doc, lastUsed: clock() });
      tell(session);
      return 'saved';
    },
    // Reading counts as use, so a draft being polled never goes idle.
    get(session) {
      evictIdle();
      const entry = drafts.get(session);
      if (!entry) return null;
      entry.lastUsed = clock();
      return entry.doc;
    },
    remove(session) {
      evictIdle();
      const had = drafts.delete(session);
      if (had) tell(session);
      return had;
    },
    size() {
      evictIdle();
      return drafts.size;
    },
    // fn runs after each put or remove of that session. Returns the unsubscribe.
    onChange(session, fn) {
      const list = listeners.get(session) ?? [];
      list.push(fn);
      listeners.set(session, list);
      return () => {
        const at = list.indexOf(fn);
        if (at >= 0) list.splice(at, 1);
      };
    },
  };
}
