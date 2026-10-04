# Aurora-5ipy.14 / .15: Mac and Windows tray Pause/Resume (written, unbuilt)

Id: mac-windows-tray-pause

Written 2026-10-04 on a Linux box; neither bead is closed. Same shape as the Linux item (docs/log/2026-10-04-linux-tray-pause.md), on the shared `PipelineHost::setRunning` (Aurora-5ipy.18).

## What changed

- Mac (`app/mac`): `TrayIcon` ctor takes `onTogglePause`/`isPaused`; menu Launch UI / Pause|Resume / Stop; `AuroraTrayMenuTarget` is the `NSMenuDelegate`, `menuNeedsUpdate:` sets the title on the main thread at open. `main.cpp`: callback sets an atomic flag, the existing tick thread calls `setRunning` (main keeps pumping AppKit).
- Windows (`app/windows`): `IDM_PAUSE` (203) in `resource.h`; `TrayIcon` ctor takes the same two callbacks; popup rebuilt per `showMenu()` so the label is read at open. Callback sets a flag, the tick loop calls `setRunning`.
- Both: a failed resume logs the error and stays paused. No new tests (neither test target covers the tray).

## Not verified (both)

- Neither app was compiled; the Mac Objective-C++ and the Windows `std::function` wiring are unchecked.
- Needs one manual pass each: label flips after Dashboard/API pause and a menu click; resume works; failed resume stays paused. Mac also: screen-recording indicator clears while paused.
- Aurora-3ddb dependency was dropped from .14/.15/.16 so these could proceed; its own live checks are still open.

## Lessons

- One new entry in architecture-process lessons: read tray state when the menu opens rather than pushing it.
