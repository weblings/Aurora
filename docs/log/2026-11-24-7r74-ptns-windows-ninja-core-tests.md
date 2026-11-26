# Windows Ninja and sccache, core tests folded into the app build

Id: 7r74-ptns-windows-ninja-core-tests

`Aurora-7r74` (windows) and `Aurora-ptns` (all three), closed, P2. PR 80 windows timed out at 30 min (normal 22-27 min). Core tests were a second configure and build of `core/` with no compiler cache.

- Windows workflow: `-G Ninja` with `CMAKE_BUILD_TYPE=Release` after `ilammy/msvc-dev-cmd`, `mozilla-actions/sccache-action` with `SCCACHE_GHA_ENABLED` and C and CXX launcher flags, `concurrency` cancel-in-progress. `--config Release` and `-C Release` dropped. Release emits no `/Zi`, so `/Z7` and CMP0141 are not needed until CI moves to RelWithDebInfo.
- Ninja layout: the app exe is `build/windows-app/bin/Aurora.exe` (no `Release/`). CI never names that path, the DLL copy uses generator expressions, tests still find OpenCV through PATH. `docs/Building.md` and `tools/light-viz-relay/devstack.py` keep the VS generator `bin/Release` path for local builds.
- vcpkg cache: the hit restored 0 packages because the key `vcpkg-Windows-v1` never re-saves and the MSVC image had changed the ABI hash. Key is now `vcpkg-<os>-<ImageVersion>-v2`. Install step 1:30-1:52 -> 12 s.
- Fold (`b50d0a46`): `AURORA_BUILD_CORE_TESTS` (default OFF) in all seven slices that force `BUILD_TESTS`, CI passes `ON`, the three "Core tests" steps are gone, ctest runs `--timeout 120`. Windows lost the `Aubio_DIR` and `VCPKG_MANIFEST_MODE=OFF` workarounds, the app root has no `vcpkg.json`.
- Result on `b0bc1052`, wall time per run: windows 22-27 -> 5.6 min (667 of 667 tests, sccache 258 of 258 hits), linux 12.1 -> 5.0 (740 tests), mac 14.8 -> 7.8 (654 tests). Parity passes at the app presets' optimization on linux and mac.
- Caveat: all three are single warm runs. The cold worst case after an MSVC image change is not measured, it should still fit the 30 min cap.

## Lessons
- A fixed `actions/cache` key never re-saves, so a vcpkg binary cache silently restores 0 packages after an image change
- Forcing a core option from a slice needs every slice that can fetch core to take it
- The Visual Studio generator ignores compiler launchers, so sccache on Windows needs Ninja plus msvc-dev-cmd
