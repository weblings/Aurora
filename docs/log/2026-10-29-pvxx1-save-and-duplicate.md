# E0b: save without going live, and duplicate an effect

Id: pvxx1-save-and-duplicate

`Aurora-pvxx.1`, the server gap in [[sequence-e-planning]]: apply was the only
write, so the editor could not offer Save beside Save and apply.

## Done

- **`POST /api/graph/save {session, id}`** (`ApplyRoutes.cpp`): apply's
  validate-and-write half, now a shared `saveDraft`, without the Config update.
  `activeEffectId` and `mcpEffectId` stay put, even for an MCP-marked save.
  When `id` is the active custom effect the pipeline reloads through the same
  coalescer (swap in place, else reload), so the running graph matches its file.
  Refusals are apply's: 400 `invalid_body`, `invalid_session`,
  `invalid_effect_id` (built-in ids never match `validId`), 404 `no_draft`,
  422 `invalid_graph` with validate's `errors`, 500 `write_failed`.
- **`POST /api/effects/:id/duplicate {id}`** (`EffectsRoutes.cpp`): copies a
  built-in (the doc `GET /api/effects/:id` returns for the current Config) or a
  custom graph to a new custom id. 409 `effect_exists` rather than replacing a
  file; 404 `unknown_effect` for the source; activeEffectId untouched. The copy
  keeps the source's title, so the picker shows two rows with one title until
  the editor renames it (rename is out of scope here).
- Access: `/api/graph/save` gets an `apply` write rule; duplicate falls under
  the existing `/api/effects` write rule. Tests cover both scopes.
- **Mirrored in `/api/v1`** (`Aurora-pvxx.10`, owner agreed): `POST
  /graph/save` and `POST /effects/{id}/duplicate` are aliases of the core
  routes with Apply scope, spec operations `saveGraph` and `duplicateEffect`
  (reusing `ApplyBody` and `Applied`, new `DuplicateBody` and `Duplicated`),
  `openapi.json` regenerated, README line added. `apiVersion` stays `1.0.0`:
  no v1 has been released, so pre-release additions fold into it.

## Verification

Core suite 469/469 (`build-core-test`), new cases tagged `[Apply]`: save leaves
activeEffectId and the running graph alone, saving over the active effect
swaps it, refusals write nothing, scope check, duplicate of `builtin.video`
equals the built-in graph, duplicate of a custom, 409/400/404 cases. The
`[api-spec]` route walk passes both ways with the two new operations, and its
scope table asserts Apply for both v1 paths. A `[PublicApi][v1]` request test
posts to both v1 paths: save leaves the active effect and running graph alone,
duplicate of `builtin.video` matches `GET /api/v1/effects/builtin.video`, and
the 400/404/409 refusals come through the aliases.

## Lessons

none
