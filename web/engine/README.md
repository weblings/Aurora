# web/engine

Browser interface to the WASM graph engine (`core/Wasm`, [[51nv4-wasm-spike]]).

- `engine.js`: `wrapEngine(module)`, a synchronous wrapper over the module's C exports. No
  Worker code, so the Node test and the demo's Worker share it. It takes objects or JSON
  text, copies frames and audio into module memory and returns the parsed JSON the C++
  made. A failed call returns `{error, message?}` and never throws.
- `engine.test.mjs`: drives every export and compares the JSON with
  `web/graph-editor/src/graph/server-samples`.

```
import createAuroraEngine from './aurora-engine.mjs'
import { wrapEngine } from './engine.js'
const engine = wrapEngine(await createAuroraEngine())
engine.init({ outputs: [{ name: 'hue', zones }] })
```

## Calls

| Call | Returns |
| --- | --- |
| `init(config)` | `{ok}`. `{outputs: [{name, zones}]}` with zones in the ZoneMapStore shape. Resets everything. |
| `setZones(output, zones)` | `{ok}`. Applies on the next step. |
| `nodes()` | The `GET /api/nodes` body. |
| `validate(doc)` | The draft validation body, `{valid, errors}`. |
| `loadLive(doc)` | `{ok}` or `{error: "cannot_load", message}`. |
| `openPreview(session, doc, layout)` | `{ok}` or `{error: "cannot_preview" or "invalid_layout"}`. Layout is `lights`, `room` or `basic`. |
| `reloadPreview(session, doc)` | `{ok}` or `{error: "draft_invalid", message}`, leaving the old graph running. |
| `closePreview(session)` | `{ok}`. |
| `feedVideo(rgba, width, height)` | `{ok}`. Kept until the next feed. |
| `feedAudio(samples, sampleRate, channels)` | `{ok}`. Read by the next step only. |
| `step(dt)` | `{ok}`. Ticks the live graph and every preview. |
| `liveColors()` | The preview stream's event body with session `live`, or `{error: "no_live_graph"}`. |
| `previewSnapshot(session)` | The preview stream's event body, or `{error: "no_preview"}`. |

`tickMs` is always 0 here. Time `step` in the caller if a figure is needed.

## Test

```
node web/engine/engine.test.mjs <aurora-engine.mjs> [fixtureDir]
```

The module path can also come from `AURORA_ENGINE_MODULE` and the fixtures from
`AURORA_ENGINE_FIXTURES`. Without fixtures the test runs
`core/Wasm/parity/gen_fixtures.py` into a temp dir. It needs a built module, so it stays
out of `web.yml`'s unit-test loop. Pass Windows paths as `C:/...`.
