// The engine-backed routes of the demo shim (Aurora-51nv.10): the node catalog, effect
// documents, drafts, previews, save, apply, Test on lights, duplicate, effect switch and
// tuning. Statuses and bodies follow core's EffectsRoutes, DraftRoutes, ApplyRoutes,
// TestRoutes and PreviewRoutes. The engine is hooks.engine (the room's Worker client).
import { demoNodes } from './demo-graph.js';
import { validEffectId, activeEffectId } from './demo-effects.js';
import { createDraftStore, validSession, DRAFT_LIMITS } from './demo-drafts.js';
import { createLightTest } from './demo-lighttest.js';
import { createPreviewHub } from './demo-preview.js';
import { buildGraphDoc } from './demo-tuning.js';
import { inputsFromVerdict } from './engine-feeds.js';

const MAX_TITLE = 80;
const chars = (text) => [...text].length;

export function createGraphRoutes(store, hooks = {}, services = {}) {
  const effects = store.effects;
  const engine = hooks.engine ?? null;
  const drafts = services.drafts ?? createDraftStore();
  const preview = createPreviewHub({ engine, drafts });
  const lightTest = createLightTest({
    hooks: {
      start: (doc, inputs) => hooks.onTestGraph?.(doc, inputs) ?? '',
      revert: () => { hooks.onTestEnd?.(); },
    },
    ...services.lightTest,
  });
  const ok = (json, status = 200) => ({ status, json });
  const fail = (error, status, extra = {}) => ok({ succeeded: false, error, ...extra }, status);
  const parse = (raw) => {
    try {
      const body = raw ? JSON.parse(raw) : {};
      return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
    } catch {
      return null;
    }
  };

  // True once the engine can answer. A missing or failed module reads as unavailable.
  async function engineUp() {
    if (!engine) return false;
    try {
      await (hooks.engineReady ?? engine.ready);
      return true;
    } catch {
      return false;
    }
  }
  const unavailable = () => fail('engine_unavailable', 503, { message: 'The light engine did not load.' });

  const running = () => activeEffectId(store.getConfig(), effects);
  const effectState = () => ({ effect: running(), requestedEffect: running() });

  // An effect's graph document: a built-in from the config overlay, a custom effect as saved.
  function documentOf(id) {
    if (effects.isBuiltin(id)) {
      return buildGraphDoc(id === 'builtin.audio' ? 'audio' : 'video', store.getConfig());
    }
    return effects.getCustom(id);
  }

  // The engine's verdict as the server words it (no inputs member), and the inputs it found.
  async function verdictOf(doc) {
    const answer = await engine.validate(doc);
    const { inputs: _inputs, ...verdict } = answer ?? {};
    return { verdict, inputs: inputsFromVerdict(answer, doc) };
  }

  // Validates the session's draft and writes it as a custom effect: the part save and apply share.
  async function saveDraft(body) {
    const { session, id } = body;
    if (typeof session !== 'string' || typeof id !== 'string') return { refused: fail('invalid_body', 400) };
    if (!validSession(session)) return { refused: fail('invalid_session', 400) };
    if (!validEffectId(id)) return { refused: fail('invalid_effect_id', 400) };
    const draft = drafts.get(session);
    if (!draft) return { refused: fail('no_draft', 404) };
    const { verdict, inputs } = await verdictOf(draft);
    if (!verdict.valid) return { refused: fail('invalid_graph', 422, verdict) };
    effects.putCustom(id, draft, inputs);
    return { id };
  }

  function sessionBody(raw) {
    const body = parse(raw);
    if (!body || typeof body.session !== 'string') return { refused: fail('invalid_body', 400) };
    if (!validSession(body.session)) return { refused: fail('invalid_session', 400) };
    return { body, session: body.session };
  }

  // Resolves to a router result, or null when the path is not one of these routes.
  async function handle(method, path, raw) {
    if (method === 'GET' && path === '/api/nodes') {
      if (!(await engineUp())) return ok(demoNodes());
      const nodes = await engine.nodes();
      return nodes?.error ? unavailable() : ok(nodes);
    }
    if (method === 'GET' && path === '/api/graph') {
      return ok({ graph: documentOf(running()) });
    }
    if (method === 'GET' && path === '/api/graph/preview/layouts') {
      return ok({ output: 'hue', savedZones: store.getZones().zones.length, basicZones: 4 });
    }
    if (method === 'GET' && path === '/api/graph/test') return ok(lightTest.info());

    const effectRoute = /^\/api\/effects\/([^/]+)$/.exec(path);
    if (method === 'GET' && effectRoute) {
      const id = effectRoute[1];
      if (!effects.exists(id)) return ok({ error: 'unknown_effect' }, 404);
      return ok({ id, builtin: effects.isBuiltin(id), graph: documentOf(id) });
    }

    if (method === 'PUT' && path === '/api/effects') {
      const id = parse(raw)?.activeEffectId;
      if (typeof id !== 'string') return fail('invalid_body', 400);
      if (id !== '' && !effects.exists(id)) return fail('unknown_effect', 404);
      store.putConfigPatch({ activeEffectId: id });
      lightTest.stop('superseded');
      hooks.onActiveGraphChanged?.();
      return ok({ succeeded: true, activeEffectId: id, ...effectState() });
    }

    const copyRoute = /^\/api\/effects\/([^/]+)\/duplicate$/.exec(path);
    if (method === 'POST' && copyRoute) {
      const body = parse(raw);
      const copyId = body?.id;
      const copyTitle = body?.title ?? '';
      if (typeof copyId !== 'string' || typeof copyTitle !== 'string') return fail('invalid_body', 400);
      if (chars(copyTitle) > MAX_TITLE) return fail('invalid_title', 400);
      if (!validEffectId(copyId)) return fail('invalid_effect_id', 400);
      if (effects.isCustom(copyId)) return fail('effect_exists', 409);
      const sourceId = copyRoute[1];
      if (!effects.exists(sourceId)) return fail('unknown_effect', 404);
      const graph = structuredClone(documentOf(sourceId));
      if (copyTitle) graph.title = copyTitle;
      effects.putCustom(copyId, graph, effects.getInputs(sourceId));
      return ok({ succeeded: true, id: copyId, source: sourceId });
    }

    const paramsRoute = /^\/api\/effects\/([^/]+)\/params$/.exec(path);
    if (method === 'PUT' && paramsRoute) {
      const id = paramsRoute[1];
      if (!validEffectId(id)) return fail('invalid_effect_id', 400);
      const edits = parse(raw)?.params;
      if (!Array.isArray(edits) || edits.length === 0) return fail('invalid_body', 400);
      if (!effects.isCustom(id)) return fail('unknown_effect', 404);
      if (!(await engineUp())) return unavailable();
      const doc = structuredClone(effects.getCustom(id));
      for (const edit of edits) {
        const shaped = edit && typeof edit.node === 'string' && typeof edit.param === 'string' && 'value' in edit;
        const target = shaped && Array.isArray(doc.nodes) ? doc.nodes.find((n) => n?.id === edit.node) : null;
        if (!target) return fail('unknown_node', 422, { edit });
        if (!target.params || typeof target.params !== 'object') target.params = {};
        target.params[edit.param] = edit.value;
      }
      const { verdict, inputs } = await verdictOf(doc);
      if (!verdict.valid) return fail('invalid_graph', 422, verdict);
      effects.putCustom(id, doc, inputs);
      if (running() === id) hooks.onActiveGraphChanged?.();
      return ok({ succeeded: true, id, ...effectState() });
    }

    const draftRoute = /^\/api\/graph\/drafts\/([^/]+)$/.exec(path);
    if (method === 'PUT' && draftRoute) {
      const session = draftRoute[1];
      if (!validSession(session)) return fail('invalid_session', 400);
      if (raw.length > DRAFT_LIMITS.maxBytes) return fail('draft_too_large', 413);
      const graph = parse(raw)?.graph;
      if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return fail('invalid_body', 400);
      const put = drafts.put(session, graph);
      if (put === 'draft_too_large') return fail(put, 413);
      if (put === 'too_many_drafts') return fail(put, 429);
      if (put !== 'saved') return fail(put, 400);
      if (!(await engineUp())) return unavailable();
      const { verdict } = await verdictOf(graph);
      return ok({ ...verdict, succeeded: true, session });
    }

    if (method === 'POST' && (path === '/api/graph/save' || path === '/api/graph/apply')) {
      const body = parse(raw);
      if (!body) return fail('invalid_body', 400);
      if (!(await engineUp())) return unavailable();
      const saved = await saveDraft(body);
      if (saved.refused) return saved.refused;
      if (path === '/api/graph/apply') store.putConfigPatch({ activeEffectId: saved.id });
      if (running() === saved.id) hooks.onActiveGraphChanged?.();
      return ok({ succeeded: true, id: saved.id, activeEffectId: store.getConfig().activeEffectId, ...effectState() });
    }

    if (method === 'POST' && path === '/api/graph/test') {
      const parsed = sessionBody(raw);
      if (parsed.refused) return parsed.refused;
      const draft = drafts.get(parsed.session);
      if (!draft) return fail('no_draft', 404);
      if (!(await engineUp())) return unavailable();
      const { verdict, inputs } = await verdictOf(draft);
      if (!verdict.valid) return fail('invalid_graph', 422, verdict);
      const mode = parsed.body.mode ?? 'once';
      if (mode !== 'once' && mode !== 'live') return fail('invalid_mode', 400);
      const error = lightTest.start(parsed.session, draft, inputs, mode);
      if (error) return fail('cannot_test', 409, { message: error });
      const { confirmMs, heartbeatMs, lapseMs } = lightTest.options;
      return ok({ succeeded: true, mode, confirmWithinMs: mode === 'live' ? null : confirmMs, heartbeatMs, revertAfterMs: lapseMs });
    }
    if (method === 'POST' && path === '/api/graph/test/heartbeat') {
      const parsed = sessionBody(raw);
      if (parsed.refused) return parsed.refused;
      if (!lightTest.heartbeat(parsed.session)) {
        const { lastEnd, holder } = lightTest.info();
        return ok({ succeeded: false, error: 'no_test', lastEnd, holder }, 404);
      }
      const { mode, confirmRemainingMs } = lightTest.info();
      return ok({ succeeded: true, mode, confirmRemainingMs });
    }
    if (method === 'POST' && path === '/api/graph/test/revert') {
      const parsed = sessionBody(raw);
      if (parsed.refused) return parsed.refused;
      return lightTest.revert(parsed.session) ? ok({ succeeded: true }) : fail('no_test', 404);
    }
    if (method === 'POST' && path === '/api/graph/test/stop') {
      return lightTest.stop('stopped') ? ok({ succeeded: true }) : fail('no_test', 404);
    }

    if (method === 'POST' && path === '/api/state/dismiss') {
      const body = parse(raw);
      if (!body || typeof body.source !== 'string' || !Number.isInteger(body.id) || body.id < 0) {
        return fail('source_and_id_required', 400);
      }
      // The demo records no errors, so every id is already gone (core's stale answer).
      return ok({ succeeded: true, dismissed: false });
    }
    if (method === 'POST' && path === '/api/reload') {
      hooks.onActiveGraphChanged?.();
      return ok({ succeeded: true });
    }
    return null;
  }

  return {
    handle,
    lightTest,
    drafts,
    streams: preview.streams,
    roomExtras: { steps: preview.steps, inputs: preview.inputs, onResults: preview.onResults },
  };
}
