# Zone maps: an output with no zone ids no longer overwrites its saved zone map

Id: 91cj-zone-map-empty-save

`Aurora-91cj` (P2, 1.2.0). Suspected from a code read while onboarding Aurora-u8jx.6; confirmed by code read and covered by a test, not reproduced against Hue or the fake bridge.

## What was found

`GraphRunner::init` reconciles each output's saved zone map against `output->zoneIds()` and saved the result unconditionally. `HueOutput::zoneIds()` is empty while the entertainment selection is not valid (output built with the bridge down), `reconcileZoneMap` keeps only live ids, so `[]` was written over the user's profile and every zone's uvs, active and gamma were lost.

## What changed

- `core/Runtime/src/GraphRunner.cpp`: `init` reads `zoneIds()` once and saves only when it is non-empty. The in-memory map is still empty, so no zone colours go out. Recovery needs no new code: `init()` reloads the saved rows each time, so the next init after the output reports its zones reconciles against the untouched file.
- `core/tests/GraphRunnerZoneMapPersistTests.cpp` (in `AuroraPipelineTests`): save skipped on empty ids (file on disk unchanged, map empty, tick sends no zone colours) and recovery on re-init.
- `GraphRunner::updateZone` is the only other `ZoneMapStore::save` caller in core; it refuses zones not in the in-memory map, so it cannot write with an empty map.
- Not traced: what triggers the second `init()` in the real app when the bridge returns (a reconnect that re-inits the runner is the path to check). A partial id list during a flaky connect would still prune the missing zones' rows; that is the intended behaviour for a changed entertainment configuration.

## Verification

- `build/core-tests`: `ctest -j8`, 497 of 498 passed. The one failure, "Concurrent settings PUTs coalesce reloads and none is lost", is in the settings PUT path, which this change does not touch. It passed 3 of 3 times on its own, and the agent's next full run passed 498 of 498. Filed as `Aurora-yqu8`.
- The new tests were not run against the old code.

## Lessons

- none
