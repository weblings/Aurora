# E1: graph editor foundation

Id: pvxx4-editor-foundation

`Aurora-pvxx.4`, from [[sequence-e-planning]]: replace the `Aurora-lzj` spike
in `web/graph-editor` with an editor that opens any effect, edits it and
refuses bad wiring. No save, preview or test-on-lights yet (E2 to E4).

## Done

- **Document model:** the whole graph is one JSON value in `App` state and
  every edit returns a new one (`graph/doc.ts`: `setParam`, `moveNodes`,
  `addEdge`, `removeEdge`, `removeNodes`). Keys the editor does not edit
  (`version`, `tickHz`, `controls`, node extras, non-node `ui` keys) survive;
  a move changes only `ui`, written once when a drag ends.
- **Adapter:** `graph/flow.ts` maps the document to React Flow nodes and
  edges. Nodes are derived in render and merged with React Flow's own state
  (selection, size, a drag in progress) by id.
- **Generic node:** `GenericNode` draws any `/api/nodes` entry (title, ports
  as handles, per-port tooltips); an unknown type shows as unsupported.
  `ParamWidget` has one widget per kind: float (slider and number),
  optional-float (set/unset), bool, enum (text box when options are empty),
  gradient (stops, add/remove 2 to 16, each stop clamped between its
  neighbours).
- **Layout:** saved `ui` positions, else columns by topological depth with
  rough heights; no dagre. Cycles terminate.
- **Wiring:** `refuseConnection` copies the loader's four rules (exact port
  type, one edge per input, no cycles, one `output.send` per output); the
  reason shows in the header on a refused drop.
- **Loading:** `?effect=<id>` or the header picker, default `builtin.video`.
- **CI:** `web.yml` gains a `graph-editor` job (`npm ci`, typecheck, Vitest)
  on any `web/**` change. Vitest 4.1.10 installs only with
  `--legacy-peer-deps` (npm 10.9 crashes resolving its peers); the lockfile
  then works with plain `npm ci`. Slice README added.

## Verification

37 Vitest tests, including snapshots of `/api/nodes` and both built-in
graphs from a current build (every existing edge passes the wiring rules,
every type has a title and port descriptions). Playwright on the Mac
fake-Hue stack against the editor embedded in the binary: `builtin.video`
(8 nodes, 7 edges), `builtin.audio` (8, 8) and a custom effect with `ui`
(8, 8) open with no console errors; param edits, optional-float toggle,
enum, drag, refused mismatch, taken input and cycle, edge delete and
redraw, node delete (13 checks). Gradient widget checked on a Candle-style
graph (noise to `color.fromGradient`): add, remove, edit, limits at 2 and
16 stops, clamping. Not run on Windows or Linux (E6 gate); the CI job has
not yet run on GitHub.

## Lessons

Three, filed: `debugging-method` (a fixture snapshot and a "not empty"
assertion can both pass on data lacking the field), `architecture-process`
(write client types from the live response; omitted optional-float is
unset), `components` (deriving React Flow nodes in an effect makes
controlled inputs revert for a render).
