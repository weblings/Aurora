# Windows verification of pause/resume and kea; Aurora.exe has no --help/--version (Aurora-v3in)

Id: windows-pause-verification

2026-10-04, Windows 11. Windows-side pass on the beads that were Linux/Mac-verified only (3ddb, kea, 5ipy.15, axoz).

## Verified on Windows

- `windows-app` Release builds, including the tray Pause/Resume code in 5ipy.15 (first compile on Windows). ctest 68/68.
- API, via devstack `--fake-hue` with live DXGI capture: `PUT /api/state` pause/resume works; SSE frames ~32/s running, 0 paused, ~31 after resume (resume took 0.1s), ~29 after three more pause/resume cycles. `/api/state` reports `paused` correctly; zone PUT while paused returns 409.
- `GET /api/state` flags on Windows: video true/zones true, audio false, `audioDevicesUrl` null.

## Not verified

- Tray menu (label flip, Pause/Resume from the tray, failed resume staying paused): manual only.
- Dashboard and Capture source screens, and the axoz pending outline/fill/revert, in a browser.
- Frame colours (the screen was dark, frames near-black); Hue DTLS resume on a real bridge.

## Findings

- `devstack.py up` failed twice with `WinError 5 Access denied` launching the just-built `Aurora.exe`; it worked once the antivirus was turned off. The owner had to disable antivirus on this machine, so a fresh build can be blocked by real-time scanning (cause not isolated beyond that). Python's `creationflags` 520 launch was fine in isolation.
- `Aurora.exe --help` and `--version` are not handled: any argument starts a full instance. A scripted flag test started several real instances (killed afterwards; killed processes can linger as zombies while a parent holds a handle). Filed Aurora-v3in.

## Beads

Filed: Aurora-v3in. Notes appended to 3ddb, kea, 5ipy.15, axoz; all keep `needs-windows`.
