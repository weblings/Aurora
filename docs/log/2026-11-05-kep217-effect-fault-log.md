# Effect route server faults reach the log

Id: kep217-effect-fault-log

`Aurora-kep2.17`, under `Aurora-kep2`. Follows `Aurora-kep2.12`, which logged rejected effect switches only.

## Done

- `logEffectFault` (`EffectsRoutes.cpp`) logs any 5xx and any 422 `unreadable_effect` at Error level through `PipelineHost::log`, so Windows, Linux and Mac all get the line. The id is written as a JSON string.
- Called from GET `/api/effects/:id`, GET `/api/v1/effects/:id`, duplicate, rename, PUT `/api/effects/:id/params`, and the shared save behind POST `/api/graph/apply` and `/api/graph/save`.
- Client-mistake 400s and 404s on hide, move and rename stay unlogged. Hide, move and delete have no server-fault path.

## Reviewed, no log

- `PUT /api/config` has only client-mistake 400s and does not check `activeEffectId`. A reload failure comes back as `reloadError`.
- `POST /api/graph/apply` 422 `invalid_graph` is explained in its response. Its 500 is logged through the shared save.
- `_wrapHandler` was not used: a 5xx hook there needs a callback wired through three app mains.

## Verification

- Pipeline and Runtime suites pass on Windows Debug. A new check asserts an unreadable effect logs once and a 404 logs nothing.
- The 500 paths have no test.

## Lessons

none
