# Aurora-3ddb: pause/resume, core and CLI only

Id: 3ddb-pause-cli

Dev session on `feat/PauseLogic`. Pause/resume in `PipelineHost` plus
`PUT /api/state`, scoped to core and route; the bead stays open for manual
platform checks. Design lives in [[external-control]] and the bead notes;
this entry records what was built, verified and found.

## Done

- **Commits:** `9623567` (bead notes, `Aurora-5ipy.17`), `4945394` (core),
  `ddc2e1d` (portal token test).
- **`PipelineHost`:** `pause()`, `resume()`, lock-free `isPaused()` (atomic).
  `reload()` while paused succeeds without building, so settings saves,
  `/api/reload` and Hue pairing stay paused. `pause()` and `resume()` are
  serialized on their own mutex; `shutdown(false)` runs outside the pipeline
  lock (Hue `disableStreaming` is a blocking HTTP call). A reload that was
  mid-build when a pause landed discards its pipeline.
- **`PUT /api/state {"running": bool}`** in core `PipelineRoutes`
  (`registerStateRoute`, wired in all three apps). Idempotent; 400 on a bad
  body; failed resume answers 500 in the `/api/reload` shape and stays paused.
- **Paused reads:** zones (with labels) and monitors come from a cache filled
  at pause time, not `ZoneMapStore`. Matches `Aurora-5ipy.13`'s "served from
  cache" and avoids needing the output name and labels without a pipeline.
- **`PUT /api/zones` while paused:** 409 `{"error": "paused"}`. Before this,
  `updateZone` returning false on a null pipeline answered 404 `unknown_zone`.
- **`GET /api/capabilities`** carries `paused` in all three apps (the route
  now takes a `PipelineHost`).
- **`PortalTokenTests`** (`input/linux/tests`): the real `XdgDesktopPortal`
  against a fake `org.freedesktop.portal.Desktop` on a private `dbus-daemon`.
  Five cases: first session sends `persist_mode` 2 and no token and stores the
  one it gets; later session sends the stored token and stores the rotated
  one; unchanged token not rewritten; no token returned leaves the stored one.
  Mutation-checked three ways (never send token, `persist_mode` 1, always
  rewrite): each failed a case.
- **Decisions** (agent-proposed, owner-approved): failed resume stays paused
  and returns the error; zone edits 409 now, direct write to `ZoneMapStore`
  filed as `Aurora-5ipy.17` (P4, only if an external controller needs it);
  repeated pause/resume is a 200 no-op.

## Verified

- Core tests 156/156 (five pause cases plus the zone 409 case); full build
  tree 89/89 including the portal token cases (0.15 s).
- **Live, Linux, `devstack.py up --app build/bin/Aurora`:** fake bridge log
  `stream active -> inactive -> active`; relay frames stop and resume; repeat
  PUTs idempotent; `/api/reload` and `PUT /api/config` while paused stay
  paused; zone PUT 409; zone and monitor GET 200; `/api/capabilities` flips.

## Not verified

- Mac and Windows app edits (route wiring, capabilities flag): never
  compiled here; the first Mac/Windows CI run is their build.
- Wayland silent resume on any real backend, and the portal code at all: it is
  carried from huenicorn and untested on real Wayland until SteamOS. The token
  test pins what Aurora sends and stores, not what a backend honors.
- Mac recording indicator clearing on pause; Windows DXGI rebuild.
- Monitor cache live: the fake source reports no monitors, so only unit tests
  cover it.
- Real-browser behavior of anything web: none was built (see Corrections).

## Findings

- **`devstack.py` launches `build/linux-app/bin/Aurora`** (the preset build
  dir), not `build/bin/Aurora` from a plain `cmake --build build`. The first
  live run hit a stale binary and answered 404 for the new route.
- The fake Hue bridge is REST-only: it logs stream transitions but cannot
  exercise a DTLS resume handshake.
- Hyperion's pause is per component; a failed LED-device enable leaves it
  disabled with an error state and a retry timer, and its API acks before the
  outcome is known. huenicorn has no pause: `Runtime::stop()` exits the loop.
- `PipewireGrabber::_initCapture` spins `g_main_context_iteration` with
  `may_block` false (busy-waits). Impact not measured; no bead filed.
- GitHub-hosted runners can run a headless wlroots compositor plus portal for
  a pause/resume job, but restore-token silence is backend-specific, so CI
  there would test Aurora's code, not GNOME/KDE behavior. One Linux job still
  suffices: nothing in today's display-free tests differs between X and Wayland.

## Corrections made this session

- Called [[external-control]] unreadable before opening it; it was readable and
  answered several questions.
- Built the Dashboard Pause/Resume button (`Aurora-5ipy.13`) after "move onto
  the next areas" without asking. The owner scoped this bead to CLI and
  disagreed with the design. Fully reverted, never committed; claim released,
  notes cleared (a "Started" timestamp remains in the bead record).
- Said Catch2 3.6 assertions are not thread-safe from memory, not from a check;
  the test avoids them off-thread either way.

## State and resume

- `Aurora-3ddb` open and claimed. Close after Mac and Windows CI compile and
  the owner accepts the manual checks, or split the manual checks into a bead.
- Next unblocked: `Aurora-5ipy.2` (`GET /api/state`); it needs an idle versus
  paused distinction (`PUT /api/state` reports `running = !paused`, so an idle
  host says running).

## Lessons

- "Pause needs its re-check at the swap, and its own mutex"
  (architecture-process.md).
- "A fake portal must answer Response unicast; GTestDBus waits 30 s on a
  process-wide connection" (input.md).
- "A harness's default binary may not be the one you just built"
  (debugging-method.md).
