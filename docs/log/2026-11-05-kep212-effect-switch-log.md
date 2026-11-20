# Rejected effect switch logging

Id: kep212-effect-switch-log

`Aurora-kep2.12`, under `Aurora-kep2`.

## State

- A rejected `PUT /api/effects` logs its code at Error level: `invalid_body`, or
  `unknown_effect` with the requested id. An `invalid_body` has no readable id.
- `PATCH /api/v1/state`, which MCP `set_effect` and its revert use, logs the same way
  when a patch carrying `effect` fails validation. The code is the effect's own, else
  the first issue's, since any bad field rejects the whole patch. Patches with no
  `effect` log nothing.
- The id is written as a JSON string, so a client's newline or escape cannot
  forge a log line.
- `PipelineHost::log` is the routes' way to the log. It shares the pipeline's
  fallback, so Windows writes through its log hook and Linux and Mac write to stderr.
- No other layer logged this. `EffectsRoutes.cpp`, the HTTP wrapper and error handler
  in `HttpLibServerImpl.hpp`, and `DashboardScreen.js` were searched and have no such log.
- User-facing copy did not change.
- Checked by unit tests only, not in a running app. The Linux and Mac path is
  covered by a test of the no-hook fallback on Windows, not by a build on those platforms.

## Not covered

Split to `Aurora-kep2.17`.

- A `PATCH /api/v1/state` 409 `nothing_to_pause` that also carries `effect` is not logged.
- `PUT /api/config` (`SettingsRoutes.cpp`) and `POST /api/graph/apply` also write
  `activeEffectId`. Their rejections were not reviewed here.
- `PUT /api/effects` has no `/api/v1` alias. The only effect write aliased is
  `POST /effects/:id/duplicate`, which shares its handler with the core route.
- The other effect routes (duplicate, hidden, move, title, delete, params) still
  reject silently, including 422 `unreadable_effect` and 500 `write_failed`.

## Lessons

- [[lesson-architecture-process]]: "An unset log hook means the default stream, not silence".
- [[lesson-architecture-process]]: "A public API write may be a separate handler, not an alias of the internal route".
