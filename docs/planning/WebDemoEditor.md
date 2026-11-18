# Graph editor in the web demo

Id: web-demo-editor

Status: planned for 1.2.0, decided 2026-11-17 under `Aurora-51nv`. Nothing built yet. The
WASM spike (`Aurora-51nv.4`) is the gate, see Gate below.

Background: [[sequence-e-research]] (WASM and the demo), [[browser-analysis]] (the original
hand-port decision this partly supersedes), [[graph-editor-cleanup]] (the editor itself).

## Goal

The GitHub Pages demo runs the graph editor against the real Aurora graph engine, compiled to
WebAssembly. A visitor can open any effect in the editor, change it, see the preview, test it
on the 3D room, and save, apply or duplicate it as a custom effect. No Hue hardware, no
install, no API key.

Not a goal for 1.2.0: the in-page agent and a WebMCP registration. Both reuse the same engine
and shim and stay stretch goals after the editor works.

## Why WASM

- The graph has 55 node types in 16 families (about 4,600 lines in `core/Runtime/src/Graph/`)
  and grows with sub-graphs (`Aurora-g5mz`) and per-node previews (`Aurora-z9vu`). The
  demo's hand-ported JS (`web-processing/`, about 350 lines) covers only the two built-ins.
  A JS evaluator would repeat that drift for every node.
- [[browser-analysis]] chose hand-porting when the logic was small and no graph existed. That
  reasoning no longer holds for the graph. It still describes the current `web-processing/`
  copies until `Aurora-51nv.11` lands.
- OpenCV use inside the graph code is small: `cvtColor` in `BlendNodes`, two `cv::Mat`
  allocations in `SpatialNodes`, the rest through `ImageProcessing` and the
  `Contracts::ImageData` contract. Building OpenCV core and imgproc for Emscripten is the
  first route to try, replacing the image type is the fallback.

## Architecture

```
 Dashboard page (vendored web/ui)          Editor page (demo entry + editor bundle)
            \                                        /
             `--> demo-shim.js: fetch + EventSource for /api/* <--'
                              |  async routes
                              v
                     Web Worker: WASM graph engine
                     (graph-only target, same C++ as the app)
                              ^                 |
        room TV canvas frames |                 | zone colors, preview frames
        Web Audio samples ----'                 v
                                        Three.js room lights
```

- The editor and Dashboard stay unaware of the demo. They call `/api/*` as in the app, and
  the shim answers.
- JSON shapes come from the same C++ as the native routes (`validateGraphDoc`,
  `GraphPreview`), so the shim forwards them unchanged.
- Custom effects and session flags live in `localStorage` so they survive moving between the
  two pages.

## Publishing

GitHub Actions builds and deploys the site to Pages. It replaces the `gh-pages` subtree push,
which is retired in the same change (`Aurora-51nv.3`).

- One workflow builds the editor bundle with the demo base, takes the CI-built WASM module,
  assembles only site files (no pruning step) and ships the editor's third-party notices file.
- No build output is committed. The editor bundle and WASM module are built in CI.
- This lifts `Aurora-ifkn`'s constraint that vendored files stay inside `web/demo`. Whether
  `vendor/webui` stays committed or is assembled at deploy time is open.
- The same pipeline serves the Dashboard when it moves to React and Grille (`Aurora-4nqt`).

## Decisions

- **WASM engine, editor first** (owner, 2026-11-17). The editor ships in the 1.2.0 demo. The
  in-page agent and WebMCP are stretch goals.
- **Actions deploy** (owner, 2026-11-17). Replaces the subtree push.
- **No JS evaluator.** If the gate fails, the editor leaves the 1.2.0 demo rather than
  running on a hand-written evaluator.
- **One engine.** The browser build links a graph-only target that the app also links
  (`Aurora-51nv.5`), not a copy.
- **Engine in a Web Worker**, so preview frames don't stall the room. The shim's routes
  become async (`Aurora-51nv.8`).
- **Duplicate gets a real route** that makes custom copies (`Aurora-kep2.23` via
  `Aurora-51nv.10`). Leaving it out of the demo's menus is the fallback only on a failed gate.
- **Portable seeded picks** in core (`Aurora-kuee`), needed for a parity check and wrong across
  platforms today.
- **Stable Grille** pinned for the release (`Aurora-1na1`). The deploy downloads it on every build.

## Gate

`Aurora-51nv.4` runs `builtin.video` and `builtin.audio` in Node from WASM, fed a fixed frame
and fixed audio samples, and compares zone colors with the native build. It also records the
gzipped WASM payload size.

- **Go:** both graphs match within a stated tolerance (seeded random picks excepted until
  `Aurora-kuee`). The size result decides the room's path (Open questions).
- **No-go:** the editor leaves the 1.2.0 demo, `Aurora-kep2.23` takes the leave-it-out option,
  and the sub-path and deploy work still ship.
- The call is made and recorded on `Aurora-51nv` the day the spike finishes.

Spike results: not yet run.

## Open questions

- **Room on the engine for built-ins too** (`Aurora-51nv.11`). Recommended if the payload is
  acceptable on first load: one path, and `web-processing/` copies, their sync rule and
  `Aurora-niv7` go away. Otherwise only custom effects use the engine.
- **Payload budget.** No number set. Decide once the spike measures it.
- **Preview transport.** Shim-side `EventSource` replacement or an injectable transport in
  the editor (`Aurora-51nv.2`).
- **Browsers.** Safari's support for the Worker, WASM exceptions and the editor bundle is
  unverified. Checked in `Aurora-51nv.12`.
- **`vendor/webui` under the Actions deploy.** Keep committed with the byte-equality check,
  or assemble at deploy time.

## Where the work is

| Part | Beads |
|---|---|
| Engine in the browser | `Aurora-kuee`, `Aurora-51nv.4` (gate), `.5`, `.6`, `.7` |
| Demo plumbing | `Aurora-51nv.1`, `.2`, `.8`, `.9`, `.10`, `.11` |
| Publishing | `Aurora-51nv.3`, `Aurora-1na1`, `Aurora-ifkn.8` |
| End to end on Pages | `Aurora-51nv.12` |
