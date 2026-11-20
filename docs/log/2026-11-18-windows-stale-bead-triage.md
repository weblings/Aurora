# Windows stale bead triage before 1.2.0

Id: windows-stale-bead-triage

Four in-progress or open Windows beads from 1.0.x were already done or overtaken by shipped work, and were closed during the 1.2.0 Windows review. No code changed.

- `Aurora-x2o.3` (first-run balloon, console decision): obsolete. The `NIF_INFO` balloon shipped in v1.0.2 (d18bb883), and Aurora now raises Windows notifications. The console question was settled by the 7l1.6 dual-mode `WIN32_EXECUTABLE` build.
- `Aurora-x2o` (Windows tray icon): all children closed. Tray icon, Stop and Open UI menu, and a no-console launch shipped by v1.0.2 (7l1). See [[gui-launch-ux]].
- `Aurora-4mk` (install() portable layout, clean-dir smoke): the layout shipped. `app/linux` and `app/windows` have install() rules, the portable trees are documented in Building.md, and release zips have shipped on all three platforms since v1.1.1. The CI clean-dir smoke test was never wired and moved to `Aurora-wg9`.
- `Aurora-vf1.1` (reload phase timing): the `[timing]` spans and `reload total` are in `Pipeline.cpp`, and the 2026-10-04 Windows data is in its notes. The unexplained gap of up to ~10 s outside the timed phases moved to `Aurora-vf1`: re-measure after Aurora-cgr's tick yield, and time the lock wait and `previous->shutdown`.

`Aurora-70gs` (Hue REST skips TLS verification) is still open and real (`HttpClient.cpp` sets `VERIFYPEER` and `VERIFYHOST` false). It is labelled 1.2.1, since it changes every real bridge's connection path on three platforms.

## Verification
- Code and tag reads only: `showFirstRunBalloon` is in v1.0.2 through v1.1.1, `gh release view v1.1.1` lists Linux, Mac and Windows zips, and `[timing]` spans are in `core/Runtime/src/Pipeline.cpp`.

## Lessons
- none
