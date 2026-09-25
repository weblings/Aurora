// Demo backend shim: answers the Dashboard's exact /api/* contract from
// demo-local state so the ported Dashboard cannot tell there is no daemon.
// No backend, no build step -- runs anywhere the static page runs.
//
// Layered for testability: createShimStore (state + localStorage guard) and
// createRouter (method+path -> {status, json}) are pure and covered by
// demo-shim.test.mjs. installDemoShim is thin browser glue (window.fetch
// override) verified by booting the page, not by unit test.
//
// Seed values mirror Aurora core's live defaults (Config.hpp persisted
// values, ConfigStore key set, SettingsRoutes/ZoneRoutes/PairingRoutes
// response shapes). The HTTP layer speaks interpolation NAMES ('Area'),
// not the storage ints -- same as SettingsRoutes::_interpolationName.

// Live Config.hpp persisted values (see Aurora/core/Runtime/.../Config.hpp).
export const DEMO_DEFAULT_CONFIG = {
  refreshRate: 0,
  subsampleWidth: 0,
  interpolation: 'Area',
  transitionSmoothing: 0,
  activeInputName: 'x11',
  activeOutputNames: ['hue'],
  activeMonitorName: '',
  activeAudioInputName: '',
  audioTargetSinkName: '',
  audioFixedAnchorHue: -1,
  audioBounceSmoothTime: 0.285,
  audioDynamismFloor: 0.26,
  audioCentroidStrength: 0.3,
  audioDriftBaseRateDegPerSec: 10,
  audioVibrancySaturation: 0.95,
  audioVibrancyValue: 0.95,
  audioReferenceRms: 0.5,
  audioBrightnessFloor: 0.4,
  audioCentroidRangeHz: 2250,
  audioBrightnessSmoothTime: 0.265,
  nuxCompleted: true,
};

const CONFIG_KEYS = new Set(Object.keys(DEMO_DEFAULT_CONFIG));
const STORAGE_KEY = 'aurora-demo-config';
const VALID_INTERPOLATIONS = ['Nearest', 'Cubic', 'Area'];

export function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, v); },
  };
}

// localStorage with private-mode fallback: Safari/Firefox can throw on
// access in private windows, so every call is guarded and degrades to
// memory (session-only persistence) instead of breaking the page.
export function safeBrowserStorage() {
  const memory = createMemoryStorage();
  const backend = () => {
    try {
      window.localStorage.getItem('__probe__');
      return window.localStorage;
    } catch {
      return memory;
    }
  };
  return {
    getItem: (k) => { try { return backend().getItem(k); } catch { return memory.getItem(k); } },
    setItem: (k, v) => { try { backend().setItem(k, v); } catch { memory.setItem(k, v); } },
  };
}

function loadPersistedConfig(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    // Whitelist, same funnel principle as SettingsRoutes: unknown keys never
    // enter the store, so a stale/corrupt payload can't poison the state.
    const clean = {};
    for (const key of Object.keys(parsed)) {
      if (CONFIG_KEYS.has(key)) clean[key] = parsed[key];
    }
    return clean;
  } catch {
    return {};
  }
}

export function createShimStore(storage = createMemoryStorage(), seed = {}) {
  const state = {
    config: { ...DEMO_DEFAULT_CONFIG, ...loadPersistedConfig(storage), ...(seed.config ?? {}) },
    zones: (seed.zones ?? []).map((z) => ({ ...z })),
    descriptors: (seed.descriptors ?? []).map((d) => ({ ...d })),
    connection: {
      configured: true,
      bridgeAddress: 'demo-bridge',
      entertainmentConfigurationId: 'demo-config-1',
      ...(seed.connection ?? {}),
    },
  };

  const persist = () => {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state.config));
    } catch {
      // Session-only from here on (see safeBrowserStorage); never fatal.
    }
  };

  return {
    getConfig: () => ({ ...state.config }),
    // Partial PATCH, SettingsRoutes convention: known keys apply (with the
    // backend's own interpolation-name rule), unknown keys are ignored.
    // Returns the list of keys that actually landed, for live-apply hooks.
    putConfigPatch: (patch) => {
      const applied = [];
      for (const [key, value] of Object.entries(patch ?? {})) {
        if (!CONFIG_KEYS.has(key)) continue;
        if (key === 'interpolation' && !VALID_INTERPOLATIONS.includes(value)) continue;
        state.config[key] = value;
        applied.push(key);
      }
      persist();
      return applied;
    },
    getZones: () => ({ outputName: 'hue', zones: state.zones.map((z) => ({ ...z })) }),
    // Identity-preserving reseed: the scene holds liveZones() across calls,
    // so the array object must survive reseeds (entries are still copied).
    setZones: (zones) => {
      const fresh = zones.map((z) => ({ ...z }));
      state.zones.length = 0;
      state.zones.push(...fresh);
    },
    // Trusted in-page backdoor for the scene renderer: the live array itself,
    // mutated in place by putZone/setZones, so per-frame reads stay fresh
    // with no copying. HTTP consumers get copies via getZones; main.js must
    // treat this as read-only. Demo-only -- never exposed over the router.
    liveZones: () => state.zones,
    // ZoneRoutes PATCH convention: only zoneId is required; uvs/active/gamma
    // apply when present. Unknown zoneId is a shim-side 404 -- the backend
    // rejects it too, and the Dashboard only ever sends loaded zoneIds.
    putZone: (body) => {
      const zone = state.zones.find((z) => z.zoneId === body?.zoneId);
      if (!zone) return { ok: false, status: 404, error: 'unknown_zone' };
      if (body.uvs !== undefined) zone.uvs = body.uvs;
      if (body.active !== undefined) zone.active = body.active;
      if (body.gamma !== undefined) zone.gamma = body.gamma;
      return { ok: true };
    },
    getDescriptors: () => ({ descriptors: state.descriptors.map((d) => ({ ...d })) }),
    getConnection: () => ({ ...state.connection }),
    putConnection: (body) => {
      if (body?.bridgeAddress !== undefined) state.connection.bridgeAddress = body.bridgeAddress;
      if (body?.entertainmentConfigurationId !== undefined) {
        state.connection.entertainmentConfigurationId = body.entertainmentConfigurationId;
      }
      if (!state.connection.entertainmentConfigurationId) {
        return { ok: false, status: 400, error: 'incomplete_connection' };
      }
      return { ok: true };
    },
  };
}

function prettyZoneName(zoneId) {
  if (typeof zoneId !== 'string') return `Demo Light ${zoneId}`;
  return zoneId.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const DEMO_MONITORS = [
  { id: 0, name: 'Demo Display', width: 1920, height: 1080, refreshRate: 60, isPrimary: true },
];

export function createRouter(store, hooks = {}) {
  const ok = (json, status = 200) => ({ status, json });

  return function route(method, path, rawBody) {
    // GET /api/capabilities -- "compiled with" contract: the demo compiles
    // to video (x11/pipewire capture names) + linux-audio + hue output.
    if (method === 'GET' && path === '/api/capabilities') {
      return ok({ inputs: ['x11', 'pipewire'], audioInputs: ['linux-audio'], outputs: ['hue'] });
    }
    // GET /api/version -- mirrors the native route: the CHANGELOG top entry
    // is the demo's version truth, pinned by demo-shim.test.mjs.
    if (method === 'GET' && path === '/api/version') {
      return ok({ version: '1.0.3' });
    }
    if (method === 'GET' && path === '/api/config') {
      return ok(store.getConfig());
    }
    if (method === 'PUT' && path === '/api/config') {
      let patch;
      try {
        patch = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return ok({ succeeded: false, error: 'invalid_json_body' }, 400);
      }
      const applied = store.putConfigPatch(patch);
      hooks.onConfigPatch?.(applied, store.getConfig());
      return ok({ succeeded: true });
    }
    if (method === 'GET' && path === '/api/monitors') {
      return ok({ monitors: DEMO_MONITORS.map((m) => ({ ...m })) });
    }
    if (method === 'GET' && path === '/api/zones') {
      return ok(store.getZones());
    }
    if (method === 'PUT' && path === '/api/zones') {
      let body;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return ok({ succeeded: false, error: 'invalid_json_body' }, 400);
      }
      if (body.zoneId === undefined) {
        return ok({ succeeded: false, error: 'zoneId_required' }, 400);
      }
      const result = store.putZone(body);
      if (!result.ok) return ok({ succeeded: false, error: result.error }, result.status);
      hooks.onZonesChanged?.(store.getZones());
      return ok({ succeeded: true });
    }
    if (method === 'GET' && path === '/api/hue/connection') {
      const c = store.getConnection();
      return ok({
        configured: c.configured,
        bridgeAddress: c.bridgeAddress,
        entertainmentConfigurationId: c.entertainmentConfigurationId,
      });
    }
    if (method === 'POST' && path === '/api/hue/connection') {
      let body;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return ok({ succeeded: false, error: 'invalid_json_body' }, 400);
      }
      const result = store.putConnection(body);
      if (!result.ok) return ok({ succeeded: false, error: result.error }, result.status);
      return ok({ succeeded: true });
    }
    if (method === 'GET' && path === '/api/hue/channels') {
      // One channel per zone, channelId == zoneId -- the mapping
      // DashboardScreen._zoneLabel assumes for "Zone N (names)" labels.
      // String ids prettify ('front-left' -> 'Front Left'); numeric ids keep
      // the Demo Light N form.
      const { zones } = store.getZones();
      return ok({
        succeeded: true,
        channels: zones.map((z) => ({ channelId: z.zoneId, lightNames: [prettyZoneName(z.zoneId)] })),
      });
    }
    if (method === 'GET' && path === '/api/descriptors') {
      return ok(store.getDescriptors());
    }
    // PUT-for-read with {} body (PairingRoutes convention -- do NOT "fix" to
    // GET; the Dashboard sends PUT and parity means matching it).
    if (method === 'PUT' && path === '/api/hue/entertainment-configurations') {
      return ok({ succeeded: true, configurations: [{ id: 'demo-config-1', name: 'Demo Room' }] });
    }
    return ok({ succeeded: false, error: 'unknown_route' }, 404);
  };
}

// Browser glue: hijacks only /api/*, delegates everything else (page assets,
// app.js's stylesheet-export fetches) to the native fetch. Returns an
// uninstall function restoring the original.
export function installDemoShim(options = {}) {
  const store = createShimStore(options.storage ?? safeBrowserStorage(), options.seed ?? {});
  const route = createRouter(store, options.hooks ?? {});
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method ?? 'GET').toUpperCase();
    if (!url.startsWith('/api/')) return nativeFetch(input, init);
    const result = route(method, url.split('?')[0], init.body ?? '');
    return new Response(JSON.stringify(result.json), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return {
    store,
    uninstall: () => { window.fetch = nativeFetch; },
  };
}
