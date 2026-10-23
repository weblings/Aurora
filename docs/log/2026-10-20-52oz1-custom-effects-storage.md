# Aurora-52oz.1: custom effects under effects/, activeEffectId, fallback warning (closed)

Id: 52oz1-custom-effects-storage

C0 of [[sequence-c-planning]]. Core suite 376/376 on Windows Debug and the
Windows app built. Linux and Mac apps got the same `main.cpp` wiring, not compiled.

## Built

- `EffectStore`: `effects/<id>.json` beside config, ids `[a-z0-9][a-z0-9_-]{0,63}`,
  temp-file-and-rename writes. Built-in ids stay `builtin.video` and
  `builtin.audio` (the `/api/state` contract), so a custom id cannot collide.
- `Config::activeEffectId`, in `/api/config`. Reload-class, except moving
  between `""` and built-in ids, which `planConfigChange` skips.
- `GraphRunner::setCustomGraph` runs the custom doc on the primary runner.
  A failed load (missing or corrupt file, removed output, unknown node) runs the
  built-in. `AURORA_DEV_DUAL_CAPTURE` ignores customs.
- `effect_fallback` host error, published by `PipelineHost::_publishBuiltLocked`
  after the build (startup, reload, resume). Clears on the next clean build.
- `/api/state` adds `requestedEffect`. `/api/graph` serves the custom doc.
- Routes: `GET /api/effects`, `GET /api/effects/<id>`, `PUT /api/effects`
  `{activeEffectId}`, `DELETE /api/effects/<id>` (deleting the active one clears
  the setting and reloads onto the built-in).
- `AccessGuard::addWriteRule`: GETs keep `read`, PUT and DELETE need `apply`.
- Dashboard toggle patch now sends `activeEffectId` (built-in). Demo vendor resynced.

## Decisions

- The switch is `PUT /api/effects`, not only `PUT /api/config`: guard rules are
  by path and `/api/config` is `admin`, so an `apply` token could not switch
  there. `PUT /api/config` still accepts the field for admin callers.
- Built-in mode still follows the active input names. A built-in id never
  changes inputs.

## Lessons

- One filed in architecture-process: path-only guard rules.
