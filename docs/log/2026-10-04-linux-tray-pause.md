# Aurora-5ipy.16: Linux SNI tray Pause/Resume (closed)

Id: linux-tray-pause

Closed 2026-10-04 together with Aurora-lx4.2 (trayless paths checked on a private bus: no watcher and no bus both run cleanly; Plasma left to a follow-up bead). Builds on the shared helper (Aurora-5ipy.18); Mac (.14) and Windows (.15) follow the same shape. Aurora-3ddb dependency dropped from .14/.15/.16 (its code and tests were already in tree; only its live checks were open).

## What changed (app/linux)

- Menu: Launch UI / Pause|Resume / Stop (ids 1 / 3 / 2). Label is read from `isPaused()` on every `GetLayout`; `AboutToShow` now returns needUpdate=true so a state change made elsewhere (Dashboard, API) shows correctly on open.
- `TrayIcon`: ctor gains `onTogglePause` and `isPaused`; `refresh()` emits `LayoutUpdated` (thread-safe via `g_main_context_invoke`, only once the loop exists, so no-bus runs never touch a dropped context).
- `main.cpp`: the tray callback only sets an atomic flag; the tick loop calls `setRunning`. No extra thread to join, D-Bus worker stays free, and blocking the loop is harmless while paused (no pipeline). Failed resume prints the error and stays paused. Loop calls `refresh()` when paused state changes.
- Tests: menu order/ids, Pause to Resume label flip (stays enabled), `refresh()` safe on a constructed icon.

## Verification

- `build/linux-app` rebuilt; 106 ctest pass.
- Fake light stack (devstack): API pause/resume flips `GET /api/state`, frames stop and return, label flips, `LayoutUpdated` fires on API-driven change; `Event` click on item 3 toggled pause both ways.
- Owner confirmed it works in situ on a real tray.

## Not verified

- Wayland resume (portal re-entry, failed-resume wording) and fake-bridge "streaming disabled" were not exercised.
- Aurora-lx4.2 (SNI icon/menu, lease expired) is still open on its own bead.

## Trayless emulation (lx4.2 matrix)

- Private `dbus-run-session` bus with no watcher: app serves normally, no icon, silent; clean SIGINT exit. Dead `DBUS_SESSION_BUS_ADDRESS`: prints "Tray: no session bus -- running without icon", same result. Stub `xdg-open` kept the browser from opening.
- First run looked like a hang: SIGINT went to the `dbus-run-session` wrapper, and `kill -9` of it orphaned Aurora (killed by hand after). Harness error, not an app bug.
- Aurora-lx4.2 and this bead closed together; Plasma left to Aurora-lx4.4.

## Lessons

- language-cpp: driving a dbusmenu tray headlessly with gdbus (`@i`/`@as` typing traps), extended with the trayless private-bus recipe.
- debugging-method: signalling a wrapper pid tests the wrapper and `kill -9` leaks the child.
