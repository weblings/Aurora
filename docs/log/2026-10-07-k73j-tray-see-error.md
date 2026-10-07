# Aurora-k73j: tray "See Error" — built, Linux-, Windows- and Mac-verified

Id: k73j-tray-see-error

2026-10-07. Implements the Tray section of [[error-overlay]]: the
Pause-slot item relabels in place to `⚠ See Error` for a failed host or a
failed resume, and clicking it opens the WebUI (the Aurora-cj11 banner
owns the explanation and retry). Bead stays open for the D-Bus live check
and Mac/Windows manual passes.

## Done

- Spec fixes first: the AC's `buildError()`-getter-plus-`isPaused()`
  wording was stale after Aurora-ja76 (a running host can hold errors, so
  the error list alone cannot drive the label) — replaced with one
  `PipelineHost::status()` snapshot read at menu open; `Idle → Pause`
  decided as status quo; [[error-overlay]] Tray paragraph touched up.
- Core `Aurora/Runtime/TrayLabel.hpp`: one pure
  `trayPauseItemLabel/showError(state, hasError, webUiBound)`; each
  platform only calls it. `TrayLabelTests.cpp` covers all 16 combos in
  `AuroraPipelineTests`; a hasError-only mutant fails 6 assertions.
- Linux/Mac/Windows trays read the snapshot at menu open (GetLayout,
  `menuNeedsUpdate:`, `showMenu`) and route a See-Error click to the
  existing Launch-UI action; `requestToggle(isPaused())` for the
  Pause/Resume path unchanged. Linux tick loop refreshes (`LayoutUpdated`)
  on state or error-presence change, not just paused. `AuroraApp` libs
  link `AuroraRuntime` PUBLIC (the tray headers now name `HostStatus`).
- Green: core 142/142 built tests (5 `*_NOT_BUILT` binaries pre-existing,
  never built in this tree), linux-app ctest 79/79.
- Live Linux binary (`/api/state`): idle → bogus reload → 500, state
  failed + one reload error → fix → reload OK → idle clean. The exact
  transitions the tray label reads.
- Lessons (existing, cited not edited): "Proxy env vars hijack localhost
  HTTP" (urllib/curl went to `http_proxy` at 127.0.0.1:34303; fixed with
  `no_proxy`, not code) and "A missing session bus in an agent shell may
  be the sandbox" (AF_UNIX blocked here, so no private or host bus).

## Not done

- D-Bus live: `GetLayout` showing See Error and `LayoutUpdated` on
  appear/clear — needs a shell that can create sockets.
- Mac manual: label shows, click lands on the cj11 banner.
- Scratch drivers in /tmp (`k73j-live.sh`, `k73j-apicycle.py`), not committed.

## Windows follow-up (same day, separate session)

- Per-platform standalone core configure done: `build-core-test-win`
  (core only) and `build-app-windows` (full `aurora-app-windows`/
  `AuroraAppWindowsTests`, via the vcpkg toolchain file) both configure and
  build clean on this machine.
- Windows click-dispatch extracted out of `TrayIcon::showMenu()` into a
  pure `Aurora::App::resolveTrayClick(picked, status, webUiBound)`
  (`app/windows/include/Aurora/App/TrayIcon.hpp` +
  `src/TrayIcon.cpp`), covering the `IDM_*` → action table the way core's
  `TrayLabelTests.cpp` covers the label itself — `TrackPopupMenuEx` needs
  real input and can't run in a unit test, so this is as far down as the
  Windows glue can be pulled. New `TrayIconTests.cpp`: 4 cases / 11
  assertions, green. Full `AuroraAppWindowsTests`: 110/110.
- Windows manual: real `Aurora.exe` built, launched with `--fresh`, forced
  into `Failed` via `PUT /api/config` (`activeOutputNames: ["hue"]`
  unpaired) + `POST /api/reload`, same trick as the Linux `/api/state`
  cycle above. Owner's eyes-on right-click found the label rendering as
  mojibake (not a missing glyph) — root cause and fix in
  [windows-env.md](../lessons/windows-env.md) ("AppendMenuA reinterprets its
  string through the ANSI codepage..."): `AppendMenuA` was decoding `kTraySeeErrorLabel`'s UTF-8
  bytes through CP1252 instead of UTF-8. Switched the tray's three
  `AppendMenuA` calls to `AppendMenuW` with a `MultiByteToWideChar`
  conversion; rebuilt, re-forced `Failed`, owner confirmed the label now
  renders and the click behavior is correct. Windows manual AC item is now
  done; Mac manual and the D-Bus live check remain open.

## Mac follow-up (same day, separate session)

Same combo as Windows: an automated step, then a manual pass on the real app.

- **Committed Mac code did not compile.** `TrayIcon.mm`'s Objective-C method
  bodies (`onTogglePause:`, `menuNeedsUpdate:`) sit outside `namespace
  Aurora::App`, so the bare `Runtime::` calls from e9ea988 failed ("undeclared
  identifier 'Runtime'"). Only the Linux and Windows builds had ever run on
  that commit. Qualified as `Aurora::Runtime::`. See [macos-gui.md](../lessons/macos-gui.md).
- **Click dispatch extracted**, mirroring Windows' `resolveTrayClick`:
  `Aurora::App::resolveTrayPauseClick(status, webUiBound)` in
  `app/mac/src/TrayClick.cpp` (header `TrayClick.hpp`), called by
  `onTogglePause:`. `TrayClickTests.cpp`: 1 case / 6 assertions. Inverting the
  rule fails 2 (mutant check). Full `AuroraAppMacTests`: 69 assertions in 23
  cases. Standalone `cmake -S core` configure and build clean, core ctest
  179/179.
- **Manual on the real `Aurora.app --fresh`.** Forcing `Failed` took a bogus
  `activeInputName` plus `POST /api/reload` ("No outputs available"); the
  Windows trick of an unpaired Hue output alone left Mac `idle`. Owner
  confirmed the menu-bar Pause slot reads `⚠ See Error` (glyph correct,
  `stringWithUTF8String:` needs no conversion) and the click opens the WebUI.
- **Banner not reached, then fixed.** `--fresh` leaves `nuxCompleted: false`,
  so the WebUI showed first-run onboarding, not the Dashboard banner (the same
  happened on the Windows pass). `PUT /api/config` with `nuxCompleted: true`
  (the save reloads and re-fails, host stays `failed`) lands the click on the
  Aurora-cj11 banner: "Couldn't apply settings: No outputs available --
  nothing to drive". Owner confirmed. The same two-step works on Windows
  without a rebuild; not re-run there.
- **Retry looks dead when the cause is unfixed.** The daemon error id
  advanced per click (3 → 5): real reloads, failing identically, banner
  unchanged. Proposal recorded in [[error-overlay]] ("Retry feedback when a
  retry fails identically"), agent-proposed, undecided.

## Still open

- D-Bus live check on Linux (`GetLayout`, `LayoutUpdated`).
- Windows banner landing (apply the `nuxCompleted` step) if the owner wants it
  recorded; not blocking.

