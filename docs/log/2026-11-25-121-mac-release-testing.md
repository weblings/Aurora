# 1.2.1 Mac release build and testing: notarized zip, monitor passes, quit crash

Id: 121-mac-release-testing

2026-11-25, macOS 27.2.1, Apple silicon, agent-run. Source `dev` at `7effb64c`.
Filed `Aurora-i6zx` (segfault on quit). Nothing published.

## Release zip

- Recipe in [[mac-notarization]], with `cmake --fresh` on `build/mac-release`
  (`RelWithDebInfo`, deployment target 27) and, beyond the recipe,
  `-DAURORA_BUILD_CORE_TESTS=ON`. `ctest`: 660/660.
- `tools/mac/sign-notarize.sh` dry run, then the real run. Submission
  `f4109dfd-2a7d-46b4-a16f-5002527e7ceb` Accepted; stapled.
- `build/notarize-out-1.2.1/Aurora_Mac_v1.2.1.zip` (renamed copy of the
  script's `Aurora-1.2.1-notarized.zip`), 20,998,834 bytes, sha256
  `26546862f2a1e3883a963376a65ea5a84efa3c75ca578746637b494ccf361c15`.
  Gitignored under `build/`.

## Verified on the extracted zip

- With a hand-set quarantine attribute: `spctl` Notarized Developer ID, staple
  valid, `codesign --verify --deep --strict` ok, `verify-bundle.sh` PASS (30
  Mach-O, one identity, no Homebrew links). Quarantine removed before launching.
- Fake-Hue stack, dummy input: `/api/version` 1.2.1, graph editor served, light
  frames flowing, 28 bundled dylibs mapped and none from Homebrew, unknown
  `Host` 403.
- Bundled `aurora-mcp`: reports 1.2.1, 16 tools; `aurora_status`, `list_nodes`
  and `list_presets` answered. No changing tool was called.
- Own Screen Recording grant: a copy in `/private/tmp` launched with `open`
  reported `permission_denied`, and the owner saw no Settings row from the
  prompt. After the owner removed the entry, a fresh extraction under
  `~/Applications` was granted and captured the built-in display. Why the first
  attempt had no row is not established.

## Display changes (virtual display, that granted copy)

`tools/mac/virtual-display-probe.m`, polling state, monitors and light frames.
This covers the identity pass [[h06o-mac-monitor-reconfiguration]] left out.

- Add and remove, two cycles: the list followed both ways, capture stayed on the
  built-in display.
- Captured display (selected by key) removed, two cycles: fell back to the
  built-in display and recaptured the virtual one by itself on return. Zone
  colors changed with each switch.
- Mirror and unmirror: the mirrored display left the list and came back; capture
  stayed on the built-in display.
- `running`, no errors, about 48-51 light frames per second in each 2 s sample.

## Browser checks against the binary's embedded web UI

All 34 check scripts (all but `graph-editor:set` and `graph-editor:slow`), on the
fake-Hue stack with `AURORA_EDITOR=embedded`, from a scratch copy whose
`restart()` relaunched the extracted app. First run 30/34. The other four:

- `effect-panel` (serves the repo's `web/ui`, not the app): one timeout, passed
  on rerun.
- `graph-editor:preview`: needs `AURORA_DEV_ERRORS=1`; passed with it.
- `graph-editor:recipes-paste`: paste right after load did nothing. With a 1.5 s
  wait after the pane appeared, all 7 recipes passed in 3 of 3 runs. Editor
  readiness is the inferred cause.
- `graph-editor:tuning-drag`: still expects an empty section to be refused first
  place, which [[e4bi-22-empty-section-leads]] allowed. Also, right after a
  section drag into first place, an immediate click on Effect menu did not open
  it (both widths); a second click, or a 1 s pause, did. Cause not found. With
  the expectation updated and a retried or delayed click, it passed.

The check edits were made in the scratch copy only; both checks are unchanged in
the repo and have no bead.

## Quit crash (`Aurora-i6zx`)

- At 15:16:26 the app segfaulted during the restart in `graph-editor:gate`,
  which passed anyway. Found later in `~/Library/Logs/DiagnosticReports`
  (`Aurora-2026-11-25-151629.ips`).
- `HttpLibServerImpl::stop()` destroys the server before `HttpServerThread`
  joins the listen thread; a worker was in the pre-routing handler. Seen once,
  not reproduced on purpose. `v1.2.0` has the same `stop()`.

## Beads export

A read-only `bd` command rewrote `.beads/issues.jsonl` from this machine's
database, restoring removed labels and dependencies on 31 beads (see
[[b665-react-free-port]]). The committed file was restored, and `Aurora-i6zx`
was added to it as one line. The local database was not repaired.

## Not verified

- Audio capture, real Hue lights, tray menu, phone pairing.
- First-open dialog of a quarantined download.
- A physical display cable pull.
- Linux and Windows.

## Lessons

- none
