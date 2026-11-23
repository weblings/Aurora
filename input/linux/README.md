# Aurora Input: Linux

Linux screen-capture input plugin for [Aurora core](../../) — implements
`Aurora::Input::IVideoInput` for both X11 and Wayland (via Pipewire/
`xdg-desktop-portal`), auto-selected at runtime by `SessionDispatch`.

Distilled from [huenicorn](https://gitlab.com/openjowelsofts/huenicorn)
(GPL-3.0), so this repo carries the same license forward — see `../../LICENSE`.

## What's here

- `DummyGrabber` — fully portable (no display needed), tested.
- `SessionDispatch` — the session-type decision logic from huenicorn's
  `GnuLinuxAdapter`, split out and tested as pure logic.
- `X11Grabber` — builds against `libX11`/`libXext`/`libXrandr`/
  `libXdamage`/`libXrender` (damage events drive static-frame reuse,
  Aurora-1pwk; chained 2x XRender composites downscale server-side before
  the read, Aurora-fq5y). Not
  unit-testable (needs a real X11 display); the damage-rect intersection
  is a pure, tested helper (`X11Damage.hpp`).
- `PipewireGrabber`/`XdgDesktopPortal` — Wayland capture via
  `xdg-desktop-portal`'s ScreenCast interface, plus Gamescope's direct
  Pipewire node. Gamescope-node matching and raw-buffer-to-`ImageData`
  conversion are pure, tested helpers; the rest needs a real Wayland session
  and portal backend. Verified end to end on Ubuntu GNOME Wayland
  (PipeWire via the `linux` input, Aurora-gj0.3/gj0.7, re-run 2026-10-04),
  and on KDE Plasma Wayland on a Steam Deck in Desktop Mode (SteamOS 3.9.5,
  Aurora running in an Arch Distrobox, 2026-11-22, Aurora-uai1): portal
  capture reaches `running`, and the restore token replays with no second
  picker after a restart. Also verified on the same Deck in Game Mode
  (2026-11-22, Aurora-i0sz): the real Aurora in the Distrobox, launched from a
  `systemd --user` service with `GAMESCOPE_WAYLAND_DISPLAY` exported from
  `/run/user/<uid>/gamescope-environment`, captures the gamescope node and
  the lights follow the screen, including the boot video. Audio in Game Mode
  (2026-11-22, Aurora-ch0g): `builtin.audio` binds the speaker sink, links
  `AuroraAudioStream` to it, and the lights follow the game's sound. Game
  Mode start and stop is automated by `tools/steamos/` (Aurora-mjk0; install with
  `setup-aurora.sh` (Aurora-hvxd) or `install-gamemode-unit.sh` alone, verified by a mode switch and a cold boot). Not
  verified on X11 sessions or a long Game Mode video run (frame rate, Aurora-ch0g).
  Buffers: LINEAR DMA-BUF is offered first, plain shared memory second
  (GNOME 46 sends a fullscreen memfd stream only empty buffers, Aurora-1t1).
  If DMA-BUF reads keep failing, or take over 100 ms three times in a row
  (`SlowReadWatch`, Aurora-vijc: ~700 ms on the Steam Deck), the grabber
  renegotiates shared memory on its own, once per stream. `AURORA_PW_DMABUF=0` forces shared memory from the start.
  Dev-only: `AURORA_DEV_PW_TRACE=1` (per-second buffer stats),
  `AURORA_DEV_PW_DMABUF_FAIL=1` (fail every DMA-BUF map). See
  [`docs/archive/LinuxCaptureAnalysis.md`](../../docs/archive/LinuxCaptureAnalysis.md).
  `PortalTokenTests` drives the real `XdgDesktopPortal` against a fake
  portal on a private `dbus-daemon` (cases SKIP without the binary), pinning
  what Aurora sends (`persist_mode`, `restore_token`) and stores, and that
  every denial, call error, malformed reply, early-Response ordering and
  missing bus/portal settles the fd promise false instead of stalling
  `PipewireGrabber` for 60s. It cannot say whether a real backend honors
  persistence. Run it under ASan + LeakSanitizer
  (`-fsanitize=address,undefined`) after touching the callbacks; it is clean.
  The shipped app persists the token in `<configRoot>/portal-restore-token`
  (user-only permissions) via `FileRestoreTokenStore`, shared by every
  `PipewireGrabber` the process builds — covered by the same test file, no
  `dbus-daemon` needed for those cases.

Grabber gotchas: `docs/lessons/input.md`.

## Building

Depends on Aurora core (`Contracts`, the `Input` interface), resolved via a
local sibling-directory path in `CMakeLists.txt` — expects this repo to sit
next to `Aurora/` on disk. Also needs, on Debian/Ubuntu:

```
sudo apt install libx11-dev libxext-dev libxrandr-dev libxdamage-dev libxrender-dev libpipewire-0.3-dev libglib2.0-dev
```

Either capture backend can be skipped independently via
`-DAURORA_INPUT_LINUX_ENABLE_X11=OFF` / `-DAURORA_INPUT_LINUX_ENABLE_PIPEWIRE=OFF`
if its dev packages aren't available.

```
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
```
