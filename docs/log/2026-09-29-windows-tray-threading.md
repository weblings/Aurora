# Windows tray threading + light-viz-stack tooling (2026-09-29)

Paused: Windows half of Aurora-zlw shipped on `fix/WindowsTrayThreading`; the Mac half is open.

## Finding

- Tray menu freezes the pipeline on Windows too, not just Mac: `TrackPopupMenuEx` (modal, blocks its thread) ran inside `trayWndProc`, dispatched from the tick loop's `PeekMessage` pump. Reproduced with `tools/light-viz-relay/traygap.py`: 0 SSE frames during a 5s menu hold.
- Aurora-zlw's premise that "Win32 needs the main thread" is wrong. Win32 window affinity is per creating thread, so the tray moves, not the tick loop. `PipelineHost`'s mutex, `HttpServerThread`, `InstanceLock` and shutdown order stay untouched. AppKit does need the main thread, so the Mac half still needs the tick-loop move.

## Shipped (app/windows/src/main.cpp)

- `TrayIcon` owns a thread: windows, `NIM_ADD`, `GetMessage` loop, and teardown (`NIM_DELETE`, `DestroyWindow`) all run there. Constructor blocks on a `std::future<DWORD>` (thread id); a setup failure is rethrown, preserving the old throw contract. Future is taken before the promise is moved (Aurora-nzd bug class).
- Tick loop no longer pumps messages.
- `g_stopRequested`: `volatile bool` -> `std::atomic<bool>` (now written from console handler, HTTP thread, tray thread).
- Destructor: `PostThreadMessage(WM_QUIT)` then `SendMessageTimeout(WM_CANCELMODE)`. A thread-posted WM_QUIT is not seen inside the menu's modal loop; first version hung forever on `/api/stop` with a menu open.

## Verified (Windows, fake-Hue stack)

- Menu held 5s: 147 frames, max gap 0.06s. Held 8s: 241 frames, max gap 0.06s.
- `/api/stop` with menu open: exits ~2s. Plain `/api/stop`: exits. ctest 70/70.
- Not verified: real logoff (`WM_ENDSESSION` now on the tray thread), a physical click, Launch UI from the tray thread. Only the synthetic `WM_TRAYICON` path was driven.

## Tooling added

- `tools/light-viz-relay/devstack.py up|status|down` + `.claude/skills/light-viz-stack` (Aurora-dp2): one-command bridge + relay + app + threaded viz server; encodes the pairing/activation REST calls (POST `/api/hue/connection`, PUT `/api/config` with `activeOutputNames=["hue"]`, `nuxCompleted`). Frames did not flow until output was activated, contrary to the README's "pairing not required". Windows-verified only; Mac/Linux verification: Aurora-df4, Aurora-beh (1.0.4).
- `up` now kills what it started if it fails partway (orphans held ports and blocked the next `up`).
- `traygap.py`: holds the tray menu via the tray callback message and reports frame gaps.
- Lesson: docs/lessons/windows-env.md (TrackPopupMenuEx freeze; dismiss menu before WM_QUIT).

## Dead ends / surprises

- Intermittent `PermissionError: Access is denied` launching the freshly built Aurora.exe: user's antivirus scanning the new binary, not a code bug.
- Piping a launched Aurora through `| tail` hangs the shell (child inherits the pipe); redirect to a file.

## Resume

Aurora-zlw (Mac): move the pipeline tick loop off the main thread in app/mac, keep AppKit pump on main; design pass on `PipelineHost` lock and shutdown ordering first. Repeat the gap capture with a held status-item menu.
