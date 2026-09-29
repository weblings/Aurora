# Windows light-viz bring-up: bare-machine build, DevLightTap Winsock port, viz serving

Closed `Aurora-gj0.10` and `Aurora-gj0.11` (`DevFrameDump` had the same Windows no-op stub; see the last section). Also closes the "Windows NOT compile-verified" caveat on `Aurora-zx4`: `app/windows` `--fake-hue` (`_putenv_s`) compiles and works.

## Bare-machine build

Fresh Windows 11, nothing but git and winget. CMake 4.4.3, Python 3.12, VS 2022 Build Tools (C++ workload) via winget; vcpkg at `C:\vcpkg` for opencv4, curl, mbedtls, aubio[core], miniaudio. `cmake --preset windows-app` with the vcpkg toolchain, Release build, 70/70 tests, 1.0.3 (`dev` at `c1cb38a`). Recipe now in `docs/Building.md` (the old prose named only OpenCV; curl/Mbed TLS/aubio/miniaudio were undocumented). The CI workflow (`choco install opencv` only) cannot supply those and is still marked "written blind" -- untouched.

Time sink: `opencv4` with default features built dnn/gapi/calib3d/directml, ~40 min. Repeated the default-features miss already filed in build-toolchain.md; next time try `--no-default-features` with only what core's `find_package(OpenCV COMPONENTS imgproc)` needs (untested).

## Root cause: DevLightTap was a Windows no-op

Pipeline started clean (fake bridge, relay, `Aurora.exe --fake-hue --fresh`, hue registered, 4 channels, bridge showing `stream conf-room-4zone -> active`) yet the relay's SSE stayed silent. `DevLightTap.cpp`'s Windows branch was empty. Implemented the Winsock twin (see the `docs/lessons/output.md` lesson on stubs); member changed to `std::intptr_t`. Verified live: SSE carried 4-zone frames within seconds of relaunch; suite still 70/70. The Winsock path has no unit test of its own (existing tests cover payload/address parsing only); live SSE is the evidence.

Config oddity, same as the existing lesson "Saved Hue credentials silently beat `AURORA_HUE_*` env vars": the persisted config id was `conf-living-room`, not the `--fake-hue` default `conf-room-4zone`. `nuxCompleted` was already true untouched by me, so the auto-opened browser tab's first-run flow is the likely writer (not proven). Corrected via `POST /api/hue/connection`; documented in the relay README's Windows section.

## Viz page serving

`viz.html` sat on "connecting..." forever (never "connection error"), with no client ever connecting to :18245 -- so the relay was healthy and the page script died first. Firefox: `Loading failed for the module ... GLTFLoader.js`, later `.../three.module.js` on a fresh port (not cache). Server log all `200`; served bytes SHA-256-identical to disk. Edge: `net::ERR_CONNECTION_RESET`. Root cause: `http.server` accept backlog of 5 vs a burst of ~12 module fetches on a slow machine. Fixed by serving with a `ThreadingHTTPServer` subclass, `request_queue_size = 256` (10-line script, kept out of the repo); user confirmed the viz working in Edge. Lesson filed in build-toolchain.md.

Not isolated: whether Firefox would also have worked on the big-backlog server (never retried); Firefox's initial failure on the very first, cache-cold load also unexplained beyond the backlog theory.

## Tooling notes

- `winget` exit 94 unless `--source winget`; shell `Path` stale after installs (windows-env.md lesson).
- `bd` was absent: `winget install GasTownHall.Beads`. A bare `bd list` on the fresh clone created an empty `.beads/embeddeddolt` and `bd import` then failed "issue_prefix config is missing"; `bd init` refuses over the existing dir and `bd config set issue_prefix` is rejected, but the next command auto-imported all 153 issues from `issues.jsonl`. `--reinit-local` never used (AGENTS.md).

## Docs touched

`docs/Building.md` (Windows recipe), `tools/light-viz-relay/README.md` (Windows path fix `bin\Release\Aurora.exe`, "On Windows" section, two troubleshooting entries), `DevFrameDump.cpp` stub comment (superseded by the gj0.11 port below), lessons README counts (build-toolchain 23, windows-env 13, output 9).

## Aurora-gj0.11: DevFrameDump Winsock port

Same shape as the `DevLightTap` port: Winsock branch in `core/Runtime/src/DevFrameDump.cpp`, `m_socketFd` -> `std::intptr_t`, and `target_link_libraries(AuroraRuntime PUBLIC ws2_32)` under `if(WIN32)` in `core/Runtime/CMakeLists.txt` (static lib, so consumers must resolve the symbols).

Verified live on Windows: app with `AURORA_DEV_LIGHT_TAP=1` + `AURORA_DEV_FRAME_DUMP=1`, fake bridge + relay up, `validate.py frame --zonemap room-4zone-zonemap.json` -> PASS, 171 frames paired against 170 tap messages, worst per-channel delta 0.0275 across 4 zones (tolerance 0.05). `windows-app` suite 70/70 (its preset excludes core's own tests; the payload/address tests never touched the socket branch). Screen was near-uniform dark, so this proves the pipeline and math, not varied content.

`validate.py` had a Windows-only bug, found by the first live run (result PASS but exit 9 with a "Fatal Python error ... daemon threads" crash): `FrameReader.stop()` closed its socket while the reader thread sat in `recvfrom()`, which raises `OSError` in that thread on Windows rather than `socket.timeout`. Fixed by joining the thread before closing. Its stop flag was also named `_stop`, shadowing `threading.Thread._stop`; renamed `_halt`. Re-run: PASS, exit 0.

## Lessons filed (whole bring-up)

- `A platform stub that compiles to a no-op is indistinguishable from a healthy idle pipeline` (output.md)
- `Python's stdlib http.server queues only 5 pending connections` (build-toolchain.md)
- `winget install fails with exit 94 unless --source winget is pinned` (windows-env.md)
- `Closing a socket while another thread is blocked in recvfrom() raises OSError on Windows` (windows-env.md)
- `Standalone cmake -S core on Windows doesn't find aubio through the vcpkg toolchain alone` (build-toolchain.md; cause of the app-vs-core difference not traced)

No lesson for the `conf-living-room` config surprise: it is the existing "Saved Hue credentials silently beat AURORA_HUE_* env vars" entry.
