# Coalesce settings-PUT reloads (Aurora-5ipy.8)

Id: 5ipy8-coalesce-settings-reloads

Closed 2026-10-16. Several controllers writing config at once each ran a full reload, one after another.

## Done

- `SettingsRoutes.cpp`: the PUT-wide mutex is replaced by a `ReloadCoalescer`. One `onConfigChanged` run in flight, at most one queued behind it, never concurrent. Every run loads config from disk when it starts, so the queued run carries the newest config. All PUTs waiting on it share its result (`reloadError` included).
- Applies to every field, not just structural ones. Live-tunable writes are cheap and idempotent from disk, so no classification was needed in the route.
- Writes stay atomic through `ConfigStore::update()`, so none is lost. The d6i7 ordering guarantee (older pipeline never swapped in last) holds because runs are serialized and each reads disk at start.
- `SettingsRoutes.hpp` contract text updated: callers' `onConfigChanged` must read fresh from disk (all three apps already do).

## Verification

- Existing d6i7 test relaxed to `1 <= reloads <= N`, max one in flight, last reload saw the final config.
- New test: first reload blocked, three more PUTs queue, release gives exactly two reloads and the second sees the last write.
- Core suite on `build-core-test-win`: all pass except `PairingService stores only token hashes` (Windows temp-dir file lock, unrelated, untouched code).

## Lessons

- None.
