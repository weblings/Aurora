# Windows light-viz bring-up: bare-machine build, DevLightTap Winsock port, viz serving

Closed `Aurora-gj0.10`. Filed, not fixed: `Aurora-gj0.11` (`DevFrameDump` is the same Windows no-op stub). Also closes the "Windows NOT compile-verified" caveat on `Aurora-zx4`: `app/windows` `--fake-hue` (`_putenv_s`) compiles and works.

## Bare-machine build

Fresh Windows 11, nothing but git and winget. CMake 4.4.3, Python 3.12, VS 2022 Build Tools (C++ workload) via winget; vcpkg at `C:\vcpkg` for opencv4, curl, mbedtls, aubio[core], miniaudio. `cmake --preset windows-app` with the vcpkg toolchain, Release build, 70/70 tests, 1.0.3 (`dev` at `c1cb38a`). Recipe now in `docs/Building.md` (the old prose named only OpenCV; curl/Mbed TLS/aubio/miniaudio were undocumented). The CI workflow (`choco install opencv` only) cannot supply those and is still marked "written blind" -- untouched.

Time sink: `opencv4` with default features built dnn/gapi/calib3d/directml, ~40 min. Repeated the default-features miss already filed in build-toolchain.md; next time try `--no-default-features` with only what core's `find_package(OpenCV COMPONENTS imgproc)` needs (untested).

## Root cause: DevLightTap was a Windows no-op

Pipeline started clean (fake bridge, relay, `Aurora.exe --fake-hue --fresh`, hue registered, 4 channels, bridge showing `stream conf-room-4zone -> active`) yet the relay's SSE stayed silent. `DevLightTap.cpp`'s Windows branch was empty. Implemented the Winsock twin (see the `output.md` lesson on stubs); member changed to `std::intptr_t`. Verified live: SSE carried 4-zone frames within seconds of relaunch; suite still 70/70. The Winsock path has no unit test of its own (existing tests cover payload/address parsing only); live SSE is the evidence.

Config oddity, same as the existing lesson "Saved Hue credentials silently beat `AURORA_HUE_*` env vars": the persisted config id was `conf-living-room`, not the `--fake-hue` default `conf-room-4zone`. `nuxCompleted` was already true untouched by me, so the auto-opened browser tab's first-run flow is the likely writer (not proven). Corrected via `POST /api/hue/connection`; documented in the relay README's Windows section.

## Viz page serving

`viz.html` sat on "connecting..." forever (never "connection error"), with no client ever connecting to :18245 -- so the relay was healthy and the page script died first. Firefox: `Loading failed for the module ... GLTFLoader.js`, later `.../three.module.js` on a fresh port (not cache). Server log all `200`; served bytes SHA-256-identical to disk. Edge: `net::ERR_CONNECTION_RESET`. Root cause: `http.server` accept backlog of 5 vs a burst of ~12 module fetches on a slow machine. Fixed by serving with a `ThreadingHTTPServer` subclass, `request_queue_size = 256` (10-line script, kept out of the repo); user confirmed the viz working in Edge. Lesson filed in build-toolchain.md.

Not isolated: whether Firefox would also have worked on the big-backlog server (never retried); Firefox's initial failure on the very first, cache-cold load also unexplained beyond the backlog theory.

## Tooling notes

- `winget` exit 94 unless `--source winget`; shell `Path` stale after installs (windows-env.md lesson).
- `bd` was absent: `winget install GasTownHall.Beads`. A bare `bd list` on the fresh clone created an empty `.beads/embeddeddolt` and `bd import` then failed "issue_prefix config is missing"; `bd init` refuses over the existing dir and `bd config set issue_prefix` is rejected, but the next command auto-imported all 153 issues from `issues.jsonl`. `--reinit-local` never used (AGENTS.md).

## Docs touched

`docs/Building.md` (Windows recipe), `tools/light-viz-relay/README.md` (Windows path fix `bin\Release\Aurora.exe`, "On Windows" section, two troubleshooting entries), `DevFrameDump.cpp` stub comment -> points at `Aurora-gj0.11`, lessons README counts (build-toolchain 23, windows-env 13, output 9).
