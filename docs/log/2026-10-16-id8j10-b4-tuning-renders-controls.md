# B4: Tuning renders the active graph's controls (Aurora-id8j.10)

Id: id8j10-b4-tuning-renders-controls

Closed 2026-10-16. Last bead of [[nodes-agent-ux]] Sequence B. Simple mode stays
the default, so Tuning keeps its look and now takes its field list from the
running graph.

## Done

- Built-in Video and Audio graphs declare `controls`: `{node, param, config,
  section?}`. `config` is the `PUT /api/config` key that commits the value, since
  that is the only live write path. The loader ignores the extra keys.
- Video lists subsample width, interpolation and transition smoothing (first
  output's ease node). Audio lists the 11 sliders under Response speed, Color
  character and Sensitivity. Refresh rate is an app setting, so Tuning keeps it
  as a fixed row on graphs with no `tickHz`.
- `web/ui/TuningControls.js` joins `GET /api/graph` with `GET /api/nodes` for
  kind, range, unit and enum options. `TuningFields.js` draws sliders, dropdowns
  and an optional-float toggle from that, replacing the hard-coded key lists.
- A control with no `config` renders read-only (no write route for graph params
  yet). Gradient params have no widget and are skipped, not shown as text.
- With no graph (no pipeline running) Tuning shows a one-line notice instead of
  fields. Before, it stayed editable while stopped.
- Demo: `demo-graph.js` answers both routes; `TuningControls.js` joined the
  vendor manifest. The unused param cache left `Tooltips.js`.
- Tests: `BuiltInGraphsTests` (controls bound to live config keys),
  `TuningControls.test.mjs`, demo shim contract. Core suite 342/342 (MSVC).

## Carried forward

- Agent-edited graphs show their controls but cannot write them until a graph
  param write route exists.
- `demo-graph.js` mirrors the C++ controls by hand.
- Regenerating the demo descriptors also added the already-missing
  `app.brightness` entry.
