# Mac tray threading (2026-09-30)

Closed: Aurora-zlw (Mac half of the tray-menu pipeline freeze; Windows half was Aurora-anw). Branch `fix/MacTrayThreading`, commit 39fb7c2.

## Decision

- Worker-thread tick loop chosen over a common-modes `CFRunLoopTimer`: `TrayIcon.hpp` forbids common modes (tao#1324 breaks menu tracking) and main never calls `[NSApp run]`, so the timer would have meant reworking the Apple-Event pump (qps.7). Lesson: docs/lessons/macos-gui.md.
- The bead's feared design pass was small: `PipelineHost`'s mutex already handles `reload()` on the HTTP thread, SCStream uses its own dispatch queue, only `TrayIcon.mm` needs main.

## Shipped (app/mac)

- `main.cpp`: tick loop on a `std::thread` (try/catch, exception rethrown on main; RAII joiner); main runs `trayIcon.pump(0.1)` until stop, joins, then `pipelineHost.shutdown()` (order unchanged). `g_stopRequested` -> `std::atomic<bool>`.
- `TrayIcon`: `pump(double timeoutSeconds)` (waits for the first event, drains the rest) and `cancelMenuTracking()` (main-queue `[menu cancelTracking]`, called by the worker on exit).
- `tools/light-viz-relay/traygap_mac.py`: manual-click frame-gap capture (System Events automation is blocked, -1743).

## Verified

- mac-app preset builds clean; AuroraAppMacTests 15 cases pass.
- SIGINT exits cleanly; `/api/stop` with no menu exits; fake-Hue dev stack up on the new build, frames flow.
- User confirmed tray behaves as intended live (menu hold no longer stalls the pipeline).

## Not verified

- Gap numbers from `traygap_mac.py` were not captured (Windows reference: 0.06s max gap over an 8s hold).
- `/api/stop` or SIGINT while the menu is held open (`cancelMenuTracking` path) not tested separately.
- Worker-thread tick cadence under App Nap in LSUIElement mode; the Aurora-cgr high-refresh cross-check.

## Surprises

- The Mac binary ignores unknown args: `Aurora --help` starts the app and blocks (killed with SIGINT, which doubled as the SIGINT test).
