# Aurora-d3ec Linux verification (compile, Catch2, live failed-state cycle)

Id: d3ec-linux-verification

2026-10-06, Linux box. Aurora-d3ec core work (commit 8d1250b) verified on
Linux; bead stays open (Windows compile + owner close outstanding).

## Compile

`cmake --build build` (`.venv/bin/cmake` 4.4.3, repo venv) clean, including
the `app/linux/src/main.cpp` startup-handoff (startup exception handed to
`PipelineHost`, mapped through `describeBuildError`).

## Catch2

`AuroraPipelineTests "[PipelineHost]"`: 22 cases pass.
`AuroraPipelineTests "[PipelineRoutes]"`: 5 cases pass.

## Live: bogus activeInputName (same injection as the Aurora-n5ly check)

Temp `AURORA_CONFIG_DIR`, `--fake-hue`, `activeInputName: bogus-input`:

- stderr: `Pipeline not started (Unknown input 'bogus-input')`.
- `GET /api/state`:
  `{"state":"failed","errors":[{"source":"startup","message":"Unknown input
  'bogus-input'"}],...}`.
- `PUT /api/state {"running":false}` -> 409
  `{"succeeded":false,"error":"nothing_to_pause"}`.
- `PUT /api/state {"running":true}` -> 500
  `{"succeeded":false,"error":"Unknown input 'bogus-input'"}`.
- Config fixed to `dummy`, `PUT {"running":true}` -> 200
  `{"running":true,"state":"running"}`; `GET` then `state: running`,
  `errors: []`, `usesVideoInput: true`.

## Full ctest

126/127 pass. Only failure: #55 `A bus with no ScreenCast portal settles
the handshake false` (`PortalTokenTests.cpp:702`, `REQUIRE(result.settled)`,
fails standalone too). Unrelated area, no code changes made this session.
Root cause found (filed as Aurora-gtkd, fix open): the "bare" fake bus is
not bare -- `ensureScreencastPortalProxy` builds its proxy with
`G_DBUS_PROXY_FLAGS_NONE`, so the fake `dbus-daemon` activates the real
`/usr/libexec/xdg-desktop-portal` (+ gnome/gtk backends) onto the fake bus
(three portal processes on `/tmp/dbus-XXX` seen live mid-run). The handshake
then hangs to the 25s method timeout instead of settling false in the 3s
bound (elapsed 25.08s, 0% CPU). Only reproduces where the portal
`.service` files exist, which is why CI stayed green. Fix options in the
bead: empty-servicedir fake daemon (test-side) vs `DO_NOT_AUTO_START`
(owner decision, changes app behavior).

## Surprises

- `build/linux-app/bin/Aurora` is stale (Oct 4, pre-d3ec): it serves the old
  `/api/state` shape with no `state`/`errors`. The fresh binary is
  `build/bin/Aurora`. Lesson filed in `docs/lessons/build-toolchain.md`.
- The first live server died mid-probe: `timeout -s KILL 120` expired during
  the PUT sequence (later curls returned 000). Re-ran with 280s. Size the
  timeout for the whole probe sequence, not the boot.
