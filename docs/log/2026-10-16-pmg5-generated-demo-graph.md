# Generated demo-graph.js and --check drift guards (Aurora-pmg5)

Id: pmg5-generated-demo-graph

Closed 2026-10-16. Follow-up to [[id8j10-b4-tuning-renders-controls]], which left the demo's graph hand-mirrored.

## Shipped

- `web/demo/gen-demo-graph.py` writes `demo-graph.js` from `BuiltInGraphs.cpp` (control-bearing nodes
  and `controls`), the Video/Frame/Audio node sources (param declarations) and `descriptors.json`
  (slider ranges). The demo's one output is `hue`, so the ease node is `ease_hue`.
- Output matches the old hand-written graphs and node schemas; `/api/nodes` params now carry
  their real descriptions instead of empty strings.
- `--check` on both `gen-demo-graph.py` and `gen-descriptors.py` exits 1 when the checked-in file is
  stale. `web.yml` runs both, and its path filter now includes the C++ sources the generators read.

## Verification

- Old and new `demoGraph` output compared in video and audio mode, node schemas compared
  ignoring descriptions. Demo shim and tuning node tests pass. `--check` fails on an edited file.

## Carried forward

- The generator reads C++ with regexes and exits on an unparsed node type, but a formatting
  change could still mis-parse. Sturdier source: dump `/api/graph` and `/api/nodes` from a core test.
