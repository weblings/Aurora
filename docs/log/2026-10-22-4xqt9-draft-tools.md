# Aurora-4xqt.9: draft tools (D3)

Id: 4xqt9-draft-tools

D3 of [[sequence-d-planning]], on the adapter from [[4xqt8-node-preset-read-tools]].
16 adapter cases pass (162 assertions).

## Built

- `Fetch` now carries method, path and body. The adapter owns one draft,
  `mcp-<pid>`, deleted by `shutdown()` when stdin closes.
- `put_draft` returns `{valid, errors}`. Invalid graphs are normal results.
  Transport, auth, 413 and 429 are tool errors.
- `set_control` finds the control by label or `node.param`, rewrites that
  param on the saved draft and re-saves it.
- `preview` wraps `/api/graph/preview/summary` and adds `reacting` per output
  and overall (zone change above 0.001 per sample).

## Verified (Windows, fake-Hue stack, `--input dummy`)

- Scripted stdio client: bad node type gave `node_type_unknown` with options,
  fixed graph validated, spatial preset previewed `reacting: true`, then
  `set_control` "Sweep speed" to 0 previewed `reacting: false`.
- Draft answered 200 before the adapter exited and 404 after.

## Not verified

- Mac and Linux. Adapter killed without closing stdin leaves its draft to the
  store's idle eviction.

## Lessons

- none
