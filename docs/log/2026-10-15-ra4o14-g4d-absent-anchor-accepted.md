# G4d: Absent-tick anchor change accepted (Aurora-ra4o.14)

Id: ra4o14-g4d-absent-anchor-accepted

Closed 2026-10-15 as accepted, no code change. Last agent-path item from the
G2 review of [[nodes-agent-ux]].

## Decision

- `audio.drift` detects a `fixedAnchorHue` change only on evaluated ticks. If
  the value goes X to Y to X across one stretch of Absent ticks (two graph
  swaps while capture is silent), the re-seed is skipped and drift keeps its
  running anchor.
- Since [[ra4o13-g4c-bounce-reseed]] drift is the only node tracking the param.
- Fixing it needs params visible to nodes on Absent ticks, a new Graph feature,
  for a case needing two edits inside one silence. The legacy path re-seeded on
  every change, so this is a small, known divergence.

## Carried forward

- The G2-review items are all closed (.11 to .14).
