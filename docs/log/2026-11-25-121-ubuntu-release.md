# 1.2.1 Ubuntu release build and testing

Id: 121-ubuntu-release

2026-11-25, Ubuntu 24.04, agent-run. Source `7abdb0ac`; app code matches
[[121-windows-release]] and, apart from one test file, [[121-mac-release-r3]].

## Release zip

- `cmake --preset linux-app` with `-DCMAKE_BUILD_TYPE=Release`,
  `-DAURORA_BUILD_CORE_TESTS=ON` and `-DCMAKE_INSTALL_PREFIX=/usr/local`, on a
  `git archive` copy of the source mounted with `bwrap` at `/usr/src/aurora`,
  so no home path is baked in. Staged with `DESTDIR`.
- `aurora.desktop` edited in the stage to `Exec=Aurora`, which needs `Aurora`
  on `PATH`. Workaround only (`Aurora-ucps`).
- `build/linux-release-1.2.1-r2-out/Aurora_Linux_v1.2.1.zip` (`bin/`,
  `share/`), 2,870,690 bytes, sha256
  `bf7d3d1689b8bacb0aa3d1fc758d06461e452bef25ea8b5f6ae1b1b8ed93a76c`.
  Gitignored under `build/`.
- An earlier zip in `build/linux-release-1.2.1-out/`, from a normal in-checkout
  build, holds the build folder in `Exec=` and the home path in the binary.
- Configure warned that `libsecret-1-dev` is missing. Only tests link
  `AuroraSecrets`, so they ran against the stub.

## Verified

- `ctest`: 757/757.
- Web unit test files 44/44, graph editor typecheck, Vitest 375/375, recipes
  build, vendor closure, generated files and API spec check. Run on the
  checkout for the first build, not repeated for the second.
- Extracted zip: no missing libraries, no username found, `/api/version` 1.2.1
  `Release`, graph editor served, about 60 fake-Hue light frames per second,
  unknown `Host` 403. `aurora-mcp`: 1.2.1, 16 tools; `aurora_status`,
  `list_nodes` and `list_presets` answered.
- Browser checks against the extracted zip's embedded web UI: all 34 (all but
  `graph-editor:set` and `graph-editor:slow`) passed, `top-bar` and
  `tuning-drag` with scratch edits (`Aurora-n335`).
- Fake bridge with a 0.3 s delayed resource reply, dummy input, 60 runs each:
  pause during a reload and pause then resume, no failure; quit during reload
  and pause traffic (SIGTERM, SIGINT, `POST /api/stop`), no bad exit, no
  stream left active, slowest 0.38 s.
- Owner: reported that the build works. What was exercised was not recorded.

## Not verified

- Not recorded as tried: real Hue bridge, screen capture on Wayland or X11,
  audio, tray menu, phone pairing, the X11 magnifier fix, SteamOS.
- A mouse drag of a Tuning section on Linux (hangs the headless check).

## Lessons

- none
