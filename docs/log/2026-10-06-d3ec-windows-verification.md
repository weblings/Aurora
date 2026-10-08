# Aurora-d3ec Windows verification (compile, Catch2, live failed-state cycle)

Id: d3ec-windows-verification

2026-10-06, Windows box. Aurora-d3ec core work (commit 8d1250b) verified on
Windows; bead closed -- Mac, Linux and Windows all confirmed now.

## Root cause found: standalone core configure silently drops into vcpkg manifest mode

`docs/lessons/build-toolchain.md` already had an entry for `cmake -S core` failing to
find aubio on Windows ("root cause not isolated"). Isolated this session:
`core/vcpkg.json` is a manifest listing only `opencv4`, `glm`, `catch2`.
Pointing the vcpkg toolchain at `core` as the top-level source makes vcpkg
see that manifest and switch to manifest mode, which builds its own
isolated `vcpkg_installed/` tree from just those three packages and never
consults the classic install -- aubio, mbedtls, curl and miniaudio become
invisible regardless of `*_DIR` hints. The `windows-app` preset never hits
this: the repo root carries no `vcpkg.json`, so it stays in classic mode
and sees the classic install (which already has all four) directly.

**Fix:** `-DVCPKG_MANIFEST_MODE=OFF` on the standalone configure. Lesson
rewritten in place (same entry, `docs/lessons/build-toolchain.md`) rather than added
as new, since it corrects the existing one's root cause and fix.

## Compile

```
cmake -S core -B build-core-test-win -G "Visual Studio 17 2022" -A x64 \
  -DVCPKG_TARGET_TRIPLET=x64-windows -DVCPKG_MANIFEST_MODE=OFF \
  -DCMAKE_TOOLCHAIN_FILE=<vcpkg>/scripts/buildsystems/vcpkg.cmake -DBUILD_TESTS=ON
cmake --build build-core-test-win --config Release
```

Configures and builds clean, including `PipelineTests.cpp` and the
startup-handoff edit to `app/windows/src/main.cpp` (verified separately
via the `windows-app` preset, below).

## Catch2

`ctest -C Release` in `build-core-test-win`: **171/171**, matching Mac's
count exactly.

`AuroraPipelineTests.exe "[PipelineHost]"`: 28 test cases, 163 assertions,
all pass. `AuroraPipelineTests.exe "[PipelineRoutes]"`: 7 test cases, 99
assertions, all pass.

## App-level build (windows-app preset)

`cmake --build build/windows-app --config Release` -- clean. `ctest -C
Release`: 79/79 (app/input/output slice tests; does not include core's
Pipeline suite, see `docs/lessons/build-toolchain.md`, line 636, on that gate already being a
known trap -- this is why a green `windows-app` run alone is not
equivalent to the check above).

## Live: bogus activeInputName (same injection as Aurora-n5ly / the Linux check)

Temp `AURORA_CONFIG_DIR`, `--fake-hue`, `activeOutputNames: ["hue"]`:

- Fresh install, no config: `GET /api/state` -> `{"state":"idle","errors":[],...}`.
- `activeInputName: "bogus-input"`: `GET /api/state` ->
  `{"state":"failed","errors":[{"source":"startup","message":"Unknown input
  'bogus-input'"}],...}`.
- `PUT /api/state {"running":false}` -> 409
  `{"succeeded":false,"error":"nothing_to_pause"}`.
- `PUT /api/state {"running":true}` -> 500
  `{"succeeded":false,"error":"Unknown input 'bogus-input'"}`.
- Config fixed to `dummy`, `PUT {"running":true}` -> 200
  `{"succeeded":true,"running":true,"state":"running"}`; `GET` then
  `state: running`, `errors: []`, `usesVideoInput: true`.

Byte-for-byte the same sequence the Linux verification logged.

## Remaining

- None for d3ec. Bead closed.
