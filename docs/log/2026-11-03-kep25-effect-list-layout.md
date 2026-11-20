# Effect list data: hidden flag, custom order and a Rename route

Id: kep25-effect-list-layout

`Aurora-kep2.5`: the panel's Hide, Unhide, Move up/down and Rename now have a
backend.

- Storage: `hiddenEffectIds` and `effectOrder` in `config.json` (Config,
  ConfigStore, ConfigApply as NoEffect). Not graph files, so built-ins can be
  hidden and moved too. Hidden is a flag only, so Unhide returns the effect to
  its place and a hidden effect still runs.
- `GET /api/effects` and `/api/v1/effects` add `hidden` and `order` (list
  index). Built-ins lead, each group follows the saved order, unlisted ids sort
  last by id. Ids deleted from disk fall out of the order on read.
- `PUT /api/effects/:id/hidden {hidden}`, `POST /api/effects/:id/move
  {direction}` (one step among visible effects of the same group, hidden ones
  skipped, `moved:false` at an edge), `PUT /api/effects/:id/title {title}`
  (custom only, trimmed, 1-80 chars, rewrites the graph's title, id unchanged).
  Core routes under the existing apply write rule, not in `/api/v1`.
- Delete drops the id from both lists.
- OpenAPI: optional `hidden` and `order` on `EffectEntry`, version left at
  1.0.0 as pvxx.3 did. Mirroring the routes is a separate bead.
- Collapse state: browser storage, per device, no backend. Applies to kep2.8.
- Demo shim: hide and move on the two built-ins (session-only), Rename answers
  400 for built-ins and 404 otherwise.
- Tests: new Effects routes case (move, edges, hidden skip, hidden still runs,
  rename validation, delete cleanup, persistence through Config), list
  assertions updated. Core 478/478, demo shim tests pass.

- Lessons: none.
