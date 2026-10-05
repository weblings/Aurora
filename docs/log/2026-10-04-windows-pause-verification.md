# Windows verification of pause/resume and kea; Aurora.exe has no --help/--version (Aurora-v3in)

Id: windows-pause-verification

2026-10-04, Windows 11. Windows-side pass on the beads that were Linux/Mac-verified only (3ddb, kea, 5ipy.15, axoz).

## Verified on Windows

- `windows-app` Release builds, including the tray Pause/Resume code in 5ipy.15 (first compile on Windows). ctest 68/68.
- API, via devstack `--fake-hue` with live DXGI capture: `PUT /api/state` pause/resume works; SSE frames ~32/s running, 0 paused, ~31 after resume (resume took 0.1s), ~29 after three more pause/resume cycles. `/api/state` reports `paused` correctly; zone PUT while paused returns 409.
- `GET /api/state` flags on Windows: video true/zones true, audio false, `audioDevicesUrl` null.

## Verified by the owner, by hand (Windows)

- Tray Pause/Resume and the Dashboard Pause/Resume button both work; the axoz pending (in-between) state toggles correctly, which matters on this slower machine.
- Pause, quit, relaunch comes back running (pause is in-memory only, per 3ddb). Quit is clean: the apparent "Stopping... but not exiting" was PowerShell not redrawing the prompt after the app's last line. Quits through `POST /api/stop` (running, paused, mid-resume) all exited in ~1s. The agent did not exercise tray Stop or Ctrl+C.

## Not verified

- Failed resume staying paused (tray and Dashboard): Aurora-n5ly. The axoz failure revert: unverified on Windows and Mac, needs a failing build.
- Dashboard and Capture source screens (kea) in a browser.
- Frame colours (the screen was dark, frames near-black); Hue DTLS resume on a real bridge: Aurora-jwcd.

## Findings

- `devstack.py up` failed twice with `WinError 5 Access denied` launching the just-built `Aurora.exe`; it worked once the antivirus was turned off. The owner had to disable antivirus on this machine, so a fresh build can be blocked by real-time scanning (cause not isolated beyond that). Python's `creationflags` 520 launch was fine in isolation.
- `Aurora.exe --help` and `--version` are not handled: any argument starts a full instance. A scripted flag test started several real instances (killed afterwards; killed processes can linger as zombies while a parent holds a handle). Filed Aurora-v3in.

- `devstack.py up` fails about one run in three on this slower machine with `TimeoutError`: the `POST /api/hue/connection` uses `http()`'s default 3s timeout while a reload takes 4-5s here. A retry works. Not fixed.

## Beads

Closed: Aurora-5ipy.15 (Windows tray), Aurora-5ipy.13 (Dashboard button), Aurora-3ddb (pause core; Linux, Mac and Windows verified). Filed: Aurora-v3in (--help/--version), Aurora-n5ly (Windows failed resume by hand), Aurora-jwcd (real-bridge DTLS resume). Aurora-axoz dropped `needs-windows` (pending state confirmed on Windows and Mac; failure revert open, waits on kea). Aurora-kea keeps `needs-windows` (Dashboard and Capture source screens). Aurora-5ipy.14 (Mac tray) stays open for the Mac failed-resume case.

## Lessons

- Two in `docs/lessons/windows-env.md`: antivirus can deny CreateProcess on a fresh exe; do not probe an exe with `--help`/`--version` unless it handles them. One in `docs/lessons/debugging-method.md`: a prompt not redrawn after a console app's last line looks like a hang.
