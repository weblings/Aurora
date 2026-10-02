# Aurora-d6i7: config.json writer race (Pipeline::build vs the settings PUT)

Id: d6i7-config-writer-race

Found while reviewing Aurora-c0g (node prep 7, hot-apply): hot-apply needs one
owner for config writes, and the code had none. Prerequisite for c0g.

## Findings

- Two writers, no coordination: `SettingsRoutes` PUT (load, patch, save) and
  `Pipeline::build`, which saved the orchestrator's whole `Config` to persist
  the derived `refreshRate`/`subsampleWidth`. `PipelineHost::reload` runs
  `build` outside the host lock and the save comes after output init, so the
  window is the Hue DTLS handshake (1-3s). A PUT saved inside it was
  overwritten by a config derived from the pre-init load, and the follow-up
  reload read the stale file.
- Handlers likely run concurrently: `HttpLibServerImpl` sets no task queue, so
  cpp-httplib's default thread pool applies (not checked against the vendored
  version; the new PUT test saw 8 handlers in flight with the lock removed).
- `ConfigStore::load` raced `save` too: `ofstream` truncates on open, so a
  concurrent load could parse a partial file as discarded and read back
  defaults. Read from the code, not reproduced. A defaults `Config` names no
  input, and `Pipeline::build` returns null for that, so a reload landing in
  the gap would swap in no pipeline.
- Two PUTs could also interleave their reloads, leaving the older PUT's
  pipeline live while disk held the newer config.

## Changes

- `ConfigStore`: one process-wide leaf mutex over every load/save, plus
  `update(mutate)`, an atomic read-modify-write that saves only when `mutate`
  returns true and saves nothing if it throws.
- `Pipeline::build` persists only `refreshRate`/`subsampleWidth`, each only
  where still 0 on disk, through `update()`.
- PUT `/api/config` uses `update()` and holds one mutex from the write through
  `onConfigChanged`. Lock order: PUT mutex, then the config file lock, then
  `PipelineHost`'s; never the reverse.

## Verification

- Core tests (Mac, `build-core-test`): 133/133, 5 new. Two `Pipeline::build`
  cases fire a PUT from the fake output's `init()` (mid-build); both failed on
  the old code. Three `ConfigStore::update` cases (save/decline, throw, 8
  threads x 25 updates). One PUT case: 8 concurrent PUTs against a slow
  callback, asserting one in flight and no field lost.
- Mutation check: removing the PUT mutex gave 8 in flight and lost fields;
  removing the `update()` lock lost updates. Both tests failed; files restored.
- Not built: the three apps (signatures unchanged). CI runs on PRs only.

## Not covered

- `POST /api/reload` and the Hue pairing reload do not take the PUT mutex, so
  they can still overlap a PUT's reload. Overlapping reloads are Aurora-5t2.

## Docs changed

- Lessons: "A save that follows slow work must write only the fields it
  derived" (architecture-process.md); "Test a window race by firing the
  competing write from a fake's hook, then mutation-check the lock"
  (debugging-method.md).
- `SettingsRoutes.hpp` header comment: PUT serialization.
