# 1.2.1 Mac release rebuild and retest: the quit, shutdown and pause fixes

Id: 121-mac-release-retest

2026-11-25, macOS 27.2.1, Apple silicon, agent-run. Source `c445835b` on
`feat/Mac1.2.1Testing`: [[i6zx-http-stop-join]], [[lyr3-shutdown-final]] and
[[83k6-pause-late-build]] on top of the build in [[121-mac-release-testing]].
Nothing published.

## Release zip

- Recipe in [[mac-notarization]], with `cmake --fresh` on `build/mac-release`
  and `-DAURORA_BUILD_CORE_TESTS=ON`. `ctest`: 668/668.
- `tools/mac/sign-notarize.sh` dry run, then the real run. Submission
  `4ba8259a-e43a-43a1-b85b-782c49cb408a` Accepted; stapled.
- `build/notarize-out-1.2.1-r2/Aurora_Mac_v1.2.1.zip`, 21,001,706 bytes, sha256
  `cac018b877b7a89221850570c8f2a755345daea1ab36f3009fd76c86ddcad1d3`.
  Gitignored under `build/`. The earlier zip, also versioned 1.2.1, is still in
  `build/notarize-out-1.2.1/`.

## Verified on the extracted zip

- With a hand-set quarantine attribute: `spctl` Notarized Developer ID, staple
  valid, `codesign --verify --deep --strict` ok, `verify-bundle.sh` PASS (30
  Mach-O, one identity, no Homebrew links). Quarantine removed before launching.
- Fake-Hue stack, dummy input: `/api/version` 1.2.1, graph editor served, about
  50 light frames per second, 28 bundled dylibs mapped and no Homebrew path
  open, unknown `Host` 403.
- Bundled `aurora-mcp`: reports 1.2.1, 16 tools; `aurora_status`, `list_nodes`
  and `list_presets` answered. No changing tool was called.

## Browser checks against the binary's embedded web UI

All 34 check scripts (all but `graph-editor:set` and `graph-editor:slow`), from
a scratch copy whose stack launched the extracted app. First run 32/34, then
34/34 with two edits made in the scratch copy only:

- `graph-editor:recipes-paste`: a 1.5 s wait after the pane appears. Passed 3 of 3.
- `graph-editor:tuning-drag`: expectations updated so the empty section may lead
  ([[e4bi-22-empty-section-leads]]), plus a 1 s pause after that drag. Passed 3
  of 3.

Both checks are unchanged in the repo and have no bead.

## Quit, shutdown and pause stress

A scratch script (not kept in the repo) ran the app against the fake bridge with
its own config root, and read the bridge's stream status after each step. "Old"
is the zip from [[121-mac-release-testing]]. All but the polling-only quit runs
delayed the bridge's `/clip/v2/resource` reply by 0.3 s, so a reload took about
0.34 s.

| Scenario, 60 runs each, dummy input | Old | New |
|---|---|---|
| Pause during a reload: bridge left streaming | 60 | 0 |
| Pause then resume during a reload: failures | 0 | 0 |
| Quit during reload and pause traffic: segfaults | 2 | 0 |
| Same runs: bridge left streaming after exit | 51 | 0 |
| Quit under polling and event streams only: failures | 0 | 0 |

- New build with live screen capture, 40 runs each of pause, pause then resume,
  and quit during traffic: no failure.
- Quits rotated through SIGTERM, SIGINT and `POST /api/stop`. The slowest
  observed on the new build took 0.55 s.
- The polling was scripted HTTP requests, not a browser tab. This covers the
  notarized-build quit that [[i6zx-http-stop-join]] left unverified.
- Both old-build crash reports (17:04) fault in the web server: one in the
  pre-routing handler, as in `Aurora-i6zx`, and one in the state route's
  `PipelineHost::status()`.

## Not verified

- Real Hue lights, so `Aurora-5q5h` is still unreproduced.
- Tray menu, audio capture, phone pairing, first-open dialog of a quarantined
  download.
- Display add, remove and mirroring: skipped because `core/` is the only code
  changed since the build that passed them.
- Linux and Windows.

## Lessons

- A Mac's maintenance sleep fails unattended checks with page-load timeouts ([[lesson-debugging-method]])
- A race test against a fake needs the fake's slow step on the path under test ([[lesson-debugging-method]])
