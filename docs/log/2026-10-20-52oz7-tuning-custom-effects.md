# Aurora-52oz.7: Tuning edits on custom effects (closed)

Id: 52oz7-tuning-custom-effects

C6 of [[sequence-c-planning]]. Core suite 408/408 on Windows Debug. Web node
tests (TuningControls, demo-shim, seams, demo-tuning) pass. No app
`main.cpp` change: the route registers with the apply routes.

## Built

- `PUT /api/effects/:id/params {"params": [{node, param, value}]}`: sets the
  params in `effects/<id>.json`, revalidates the edited graph, writes, and when
  `<id>` is the active effect applies through the same coalesced swap as
  `/api/graph/apply`. Refusals write nothing. Covered by the existing
  `/api/effects` apply-scope prefix rule.
- Tuning: `fetchTuningGraph` also reads `/api/effects` for the running effect
  id. On a custom effect every control is writable, `config` keys are ignored,
  and edits go to the new route (`buildEffectEdits`). Built-ins still use
  `/api/config`. A refresh-rate change does not re-send unchanged params.
- Demo shim answers `GET /api/effects` as a built-in, so Tuning there is
  unchanged.

## Decisions

- Custom ignores `config` keys: a graph copied from a built-in keeps them,
  but Config has no effect on a custom graph.
- An optional param switched off is written as `null`, the graph's unset.

## Lessons

- none
