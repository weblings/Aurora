# Sequence E research: what the editor can reuse, and what it is missing

Id: sequence-e-research

Research before planning Sequence E (the React Flow editor) of
[[nodes-agent-ux]]. No code changed, no beads filed. Read on `feat/NodesVisuals`
at 0f11b3c.

## Owner decisions this session

- **Effect picker (`Aurora-kep2`) is not a prerequisite.** It is how users get
  into the editor, not part of it, so it can follow when the editor is ready.
  The A/B/C design choice stays open.
- **A graph with no source is valid.** The candle graph is one. `Aurora-t9iq`
  narrows to the Dashboard's empty state (see Findings).

## Starting point

- `web/graph-editor/` is the `Aurora-lzj` spike plus the `Aurora-p1qj` theme:
  `App.tsx` draws a hardcoded Input → Output pair and fetches `/api/version`.
  No adapter, no node component, no tests.
- Build: `AURORA_ENABLE_GRAPH_EDITOR` is OFF by default. The three OS
  workflows turn it on. CI runs `vite build` only: `npm run typecheck` is not
  run anywhere, and there is no test runner (no Vitest).
- No WebUI screen links to `/graph-editor/`.
- The slice has no `README.md`, unlike the other `web/*` slices.
- `npm run dev` proxies `/api` to a running Aurora (`AURORA_PORT`), so the
  editor hot-reloads without a C++ rebuild.

## Server surface the editor can use as is

- **Catalog:** `GET /api/nodes` has, per type: `type`, `purpose` (= descriptor
  `details`), `useWhen`, `example`, `cost`, `inputs` (`name`, `type`,
  `required`), `outputs`, `params`, and `sink` for `output.send`. Params carry
  `kind` (Float, OptionalFloat, Bool, Enum, Gradient) with `label`, `min`,
  `max`, `step`, `unit`, `default`, `allowsUnset`, `options` and `description`.
  About 30 types.
- **Load:** `GET /api/effects/:id` returns `{id, builtin, graph}` for customs
  and for both built-ins (built-ins are generated from config with the output
  names filled in). `GET /api/graph` returns the live graph.
- **Edit loop:** `PUT /api/graph/drafts/:session` with a client-chosen session
  (`[A-Za-z0-9_-]{1,64}`), then `POST /api/graph/validate`. Errors come back
  with a code, node, field and nearest valid options (D0c). Codes include
  `port_type_mismatch`, `graph_cycle`, `input_multiple_edges`,
  `output_multiple_senders` and `output_unregistered`.
- **Preview:** SSE `GET /api/graph/preview?session=`, about 15 Hz, sends only
  when colors change, with zone colors per output plus `errors` (output, node,
  message) and `tickMs`. A changed draft hot-reloads into the open preview, so
  edit → preview needs no extra call. Refusals come as `event: error`, and the
  stream ends with `replaced`, `pipeline_gone` (rebuild or **pause**) or
  `draft_deleted`.
- **Test on lights:** `/api/graph/test` with heartbeat, confirm, revert and
  stop, and a 120 s cap while heartbeats continue (D0d).
- **Apply:** `POST /api/graph/apply {session, id}` validates, writes
  `effects/<id>.json` with the draft as is, and activates it.
- **Auth:** loopback is trusted. On the LAN the editor needs pairing like the
  WebUI. Draft and validate need `Draft` scope, apply needs `Apply`.
- **Layout:** the loader ignores `ui`, and the document is stored unchanged,
  so `ui` survives a save. Verified (see Verification run), including keys
  that aren't node ids, such as a `viewport`.

## Gaps and findings

1. **Port rules are strict equality.** The loader rejects any
   `out.type != in.type`, with no coercions, one edge per input, no cycles
   and one `output.send` per output. React Flow's `isValidConnection` can
   copy these rules exactly from `/api/nodes`.
2. **The catalog has no display data.** Nodes have no title or category
   (needed to group a palette), and ports have no description (the plan
   wants "port meanings" in the inspector). Use `type` prefixes (`audio.*`,
   `frame.*`, ...) as categories, or add fields to the registry.
3. **The `output` param is an Enum with empty `options`.** It is checked
   against the registered outputs only when the graph loads, so the editor
   needs the output names from elsewhere (config or capabilities) to fill a
   picker.
4. **There are no per-node previews.** `GraphPreview` reports only per-output
   zone colors. The evaluator does keep every port's value
   (`Graph::portValue(node, port)`, already used to read errors off
   `output.send`'s feeding edge), so a per-node stream is buildable. It needs
   a subscription route (the plan's `PUT` by session), encoders per port type
   (Image thumbnail, Color, Frame strip, Float, Angle, Trigger) and a reader on
   another thread that doesn't race the tick. Decide whether this is in E or
   after it.
5. **Preview stops while paused.** A pause ends the stream with
   `pipeline_gone`, and a new stream or summary is refused with
   `cannot_preview` ("no pipeline is running") until the lights resume
   (verified). Preview also needs the live pipeline's inputs (D0a made
   graphs needing other inputs previewable). Decide whether the editor shows
   a paused state or offers to resume. Same root as `Aurora-que2` (filed
   2026-10-29, in progress, no approach chosen): `GraphRunner::openPreview`
   ticks the preview inside the live runner, so with no live pipeline
   (paused, or a failed input build) even a source-less graph can't be
   previewed. Whatever que2 picks decides this for the editor.
6. **Built-ins have no `ui`.** Opening Video or Audio in the editor needs
   automatic layout. React Flow has none built in, so this needs a dependency
   decision (dagre or elkjs), or a hand-rolled column layout by topological
   depth (graphs are small).
7. **A test on the lights is silently taken over.** There is one test slot,
   and a second session's `POST /api/graph/test` ends the first one without
   telling it. The first session finds out only when its next heartbeat gets
   `no_test` (within `heartbeatMs`, 2 s), and `GET /api/graph/test` and the
   `test` block in `/api/events` don't say which session holds the test
   (verified). An editor and an MCP agent can take it from each other with
   neither able to explain why. Fix: put the owner (session, or editor vs
   agent) in the test state, or refuse a second test with a 409 that the
   caller can override. Filed as `Aurora-0tqq`. (Checked and ruled out: apply can't overwrite a
   built-in. Built-in ids are `builtin.video` and `builtin.audio`, and
   `EffectStore::validId` rejects the `.`, giving `invalid_effect_id`.
   `video` is an ordinary custom id.)
8. **Every save activates the effect.** Apply is the only write, so there is
   no "save without making it live", no rename and no duplicate. Decide
   whether E needs a save-only route, or whether drafts (kept per session)
   are enough.
9. **Source-less graphs (`Aurora-t9iq`) mostly work already.** The rainbow
   preset ran with no inputs on Windows under `Aurora-kgv7`, and the pickers
   now follow `graphInputs` (`DashboardScreen.test.mjs` covers
   `{video:false, audio:false}`). What's left is the copy shown when a graph
   has neither input, and the "nothing active" case (fresh install,
   `Pipeline::build` → nullptr), which `Aurora-zl32` now covers (an explicit
   no-input running state). A Candlelight draft hit `Aurora-que2` on Mac
   with Screen Recording denied.
10. **Drafts live only in memory.** `DraftStore` holds at most 16 drafts of
    256 KB each and evicts one after an hour idle. A restart loses them all.
    The plan's "drafts save even when invalid, so work is never lost" holds
    only within one run. An editor needs drafts on disk, browser storage as a
    backup, or a save-only route (item 8).
11. **Release builds won't ship the editor** while the flag defaults to OFF.
    E needs a decision on when it turns on for packaged builds, and the Node
    build prerequisite that comes with it ([[node-graph-pipeline]] "Consequences
    to carry").

## WASM and the demo (`Aurora-51nv`)

WASM helps the editor only **in the demo**. In the app, the editor uses the
server routes above, and WASM changes nothing there. In the demo, an editor
needs something to validate and evaluate drafts, and WASM gives that with
exact parity instead of porting every node to JS. Findings on the cost:

- Graph code is inside `AuroraRuntime`, one static library that also holds
  config, the HTTP routes and the pipeline. A WASM build needs a graph-only
  target carved out: `Graph/*.cpp` plus `Smoother`, `FrameCompositor`,
  `AudioFrameCompositor`, `BrightnessFloor`, `ZoneMap` and contracts.
- OpenCV is in the contract, not just the processing code.
  `Contracts::ImageData` holds a `cv::Mat`, and `AuroraContracts` links
  OpenCV, so every target links it, and the `Image` port type is a `cv::Mat`.
  `BlendNodes`, `SpatialNodes`, `ImageProcessing` and every grabber touch
  `imageMatrix`. The calls themselves are few: `cvtColor`, `resize`, `mean`
  and `Mat`/`Range`. Two routes: build OpenCV's core and imgproc as
  Emscripten static libraries and link them unchanged (OpenCV supports
  Emscripten builds; bundle size unmeasured, vcpkg support for
  `wasm32-emscripten` unverified), or replace `cv::Mat` in the contract with
  an Aurora image type (touches all grabbers on three OSes). The first suits
  a spike.
- Audio nodes link aubio through `AuroraAudioProcessing` (pvoc, specdesc,
  onset, which use aubio's FFT). `aubiojs` on npm is an Emscripten build of
  aubio, so aubio is known to compile. Our build gets it from vcpkg on
  Windows and apt on Linux, so WASM needs its own aubio build step.
- No other blockers: glm and nlohmann are header-only, the graph code and
  its helpers use no threads, files or clocks (only `ZoneMapStore`, which
  stays out), and `Config.cpp` is pure. `GraphLoader` uses try/catch, so the
  build needs Emscripten exceptions turned on (`-fexceptions`), at some cost
  in size.
- Parity caveat: `palette.randomAnchor` and audio anchor re-seeding use
  `std::uniform_int_distribution`, whose output differs between standard
  libraries. A seeded pick can differ between WASM (libc++), MSVC and
  libstdc++, and already differs between Mac and Windows. A parity check
  must skip these nodes or replace the distribution with a portable
  mapping.
- Graph nodes see inputs only through `IVideoInput`/`IAudioInput` and
  `GraphHost` services, so the browser can feed frames as data.
- `51nv`'s proposed spike still fits: build `Graph.cpp` with the math and
  color nodes, run a source-less preset in Node, and compare with the
  native build. Even a source-less graph links OpenCV through
  `AuroraContracts`, so the spike settles the OpenCV route first.

Recommendation for planning: E does not have to wait on `51nv`. The app
editor is built against the HTTP API, so choose a demo backend that serves
the same API (as `demo-shim.js` already fakes `/api/*`). WASM then plugs in
behind the shim later without editor changes. Record that in `51nv` and run
the spike beside E rather than before it.

## Verification run

Mac, `devstack.py up` (fake Hue, live capture), app rebuilt at 0f11b3c. The
first `cmake --build` of `aurora-app-mac` failed and the second passed with
no changes in between. The first log wasn't kept, so the cause is unknown. A
stale Aurora held port 8215 on the first `up` and had exited by the retry.

- Put the rainbow preset with `ui` (two nodes plus `viewport`) into a draft
  (body `{"graph": ...}`), applied it as `e-ui-check`, and read it back from
  `GET /api/effects/:id`, `GET /api/v1/effects/:id` and `GET /api/graph`.
  `ui` was intact in all three, and still intact after
  `PUT /api/effects/:id/params`, which rewrites the file.
- Apply as `video` and `audio`: 200, written as ordinary customs.
  `builtin.video`: 400 `invalid_effect_id`.
- Two sessions tested one after the other: item 7.
- Opened a preview SSE and paused with `PATCH /api/v1/state
  {"running": false}`: 30 `preview` events in about 2 s (15 Hz, rainbow
  changes every tick), then `ended` `pipeline_gone`. Reopening while paused
  gives `event: error`. The summary route gives 422 `cannot_preview`.

## Prior art

- **Save model.** ComfyUI keeps two stores: explicit saves on the server,
  and drafts autosaved to browser `localStorage` (debounced about 500 ms) so
  a refresh loses nothing. It also shows a "Save changes?" prompt from an
  unsaved flag per workflow. Node-RED keeps unsaved edits only in the
  browser. The server knows nothing until Deploy, which turns red while
  changes are pending, and the editor offers to merge when someone else
  deploys in the background. Home Assistant's automation editor has explicit
  Save, got undo/redo only in 2025.10, and users still ask for a
  leave-without-saving prompt. Pattern for E: autosave the working copy in
  the browser, keep the server draft as what preview and test read (memory
  only, as now), and make Save an explicit act separate from making the
  effect live. Given item 7, follow Node-RED in telling the user when
  someone else changed the live effect.
- **Per-node previews.** TouchDesigner cooks a node for its viewer only
  while the viewer is visible: being looked at is itself a reason to cook,
  and turning viewers off is a standard optimization. ComfyUI streams
  previews over its websocket as binary frames (a 4-byte type, then JPEG or
  PNG) next to JSON progress messages. Pattern for E: subscribe by the
  visible node ids (as the plan already proposes) and send thumbnails in a
  compact encoding apart from the scalar values. Aurora's evaluator already
  computes every node each tick, so visibility drives only the encoding
  cost, not extra evaluation.
- **Layout and rendering.** React Flow's docs call dagre a near drop-in and
  elkjs the configurable one, and both are shown as examples. Community
  write-ups put layout cost in the 1000-node range, far above Aurora's
  graphs. Watch the half-size offset: dagre returns centers, React Flow
  positions by the top-left corner. React Flow's performance page says
  custom nodes must be `React.memo` or declared outside the parent, and
  selection should be kept out of the nodes array. One community benchmark
  showed an inline function prop dropping 100 nodes from about 60 to 10
  FPS. That supports the plan's rule that live preview values go to
  refs/canvas, not node data.

Sources: [React Flow layouting](https://reactflow.dev/learn/layouting/layouting),
[React Flow performance](https://reactflow.dev/learn/advanced-use/performance),
[TouchDesigner Cook](https://derivative.ca/UserGuide/Cook),
[ComfyUI websocket events](https://www.mintlify.com/Comfy-Org/ComfyUI/api/websocket-events),
[ComfyUI draft error write-up](https://www.popularai.org/p/how-to-fix-comfyuis-failed-to-save),
[Node-RED editor header (FlowFuse)](https://flowfuse.com/node-red/getting-started/editor/header/),
[Home Assistant 2025.10 release](https://www.home-assistant.io/blog/2025/10/01/release-202510/).
ComfyUI's details come from secondary sources and mirrors, not its own repo.

## Questions for the planning session

- Is per-node preview (item 4) in E's scope or a later sequence?
- Save model: apply-only, or a save-only route plus rename and duplicate
  (items 8, 10)? Prior art points to browser autosave plus an explicit save.
- Test ownership (item 7): show who holds the test, or refuse a second one?
- Auto-layout dependency or hand-rolled (item 6)?
- Should display fields (title, category, port descriptions) go into the
  registry now (item 2)? The agent catalog would also use them.
- Authoring `controls` (exposing a param to the Dashboard with an optional
  tooltip override): in E or later?
- Gate shape: probably open a built-in, fork it, rewire it on the fake-Hue
  stack, preview, test on lights, apply and reload, on three OSes. Also
  whether E adds Vitest and a CI typecheck step.

## Lessons

- none
