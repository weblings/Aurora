# Aurora-axoz: pending highlight on Video/Audio switch (implemented, tracker close refused)

Id: axoz-pending-highlight

Implemented 2026-10-04. Owner-requested; kea (dependency) already merged to dev.

## What changed

- `web/ui/CaptureSource.js`: new `modeFromFlags`, `flagsMatchMode` (input
  pair only — zone sampling follows the effect), `isSwitchConfirmed`
  (PUT succeeded + no reloadError + flags agree).
- Both screens: click outlines the choice and disables both buttons; fill
  follows running flags, never saved config; failure keeps the old fill with
  today's error. Paused switch stays silent with no false fill (reload()
  succeeds without building, `Pipeline.cpp:441`).
- `ModeDeviceScreen` sections follow the pending choice while in flight and
  revert on failure; device edits wait out an in-flight switch instead of
  racing it with a second PUT.
- `web/ui/styles/forms.css`: `.segmented-btn.pending` outline,
  `cursor: wait` on disabled.
- Demo: `CaptureSource.js` + `forms.css` verbatim; live Dashboard ported
  with seams intact + axoz seam tripwires. Dead `ModeDeviceScreen` copy left
  stale (pre-kea, never mounted). Shim unchanged — already answers every
  route the ported flow probes (`/api/state` from config confirms at once).

## Verification

- `CaptureSource.test.mjs` (confirm, failure, paused) + all web/ui and demo
  suites green; `node --check` on edited screens.
- Live daemon via light-viz stack: frames flowing, toggle present
  (`linux-audio` compiled in), served `DashboardScreen.js` contains the new
  code. No rebuild needed — dev serves `web/ui` from disk
  (`AURORA_WEBUI_DIR` > baked source dir > embedded; see the web-testing
  lesson on the two serving paths, dev mount vs embedded).
  No switch clicked live (audio capture may pop a portal dialog).

## Surprises / notes

- `bd close axoz` refused: tracker still lists kea as blocking although kea
  is merged. Bead stays claimed; close needs `--force` or kea status fixed.
- `cmake` absent from PATH on this machine; irrelevant here since no rebuild
  was needed. `make`/`python3`/`g++` present.
- Later: upgrade 'confirmed' to lights-reacting on 5ipy.2 health; pattern
  carries to kep2's Effect dropdown.
