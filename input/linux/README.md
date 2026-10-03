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
- `X11Grabber` — builds against `libX11`/`libXext`/`libXrandr`. Not
  unit-testable (needs a real X11 display).
- `PipewireGrabber`/`XdgDesktopPortal` — Wayland capture via
  `xdg-desktop-portal`'s ScreenCast interface, plus Gamescope's direct
  Pipewire node. Gamescope-node matching and raw-buffer-to-`ImageData`
  conversion are pure, tested helpers; the rest needs a real Wayland session
  and portal backend — see
  [`docs/archive/LinuxCaptureAnalysis.md`](../../docs/archive/LinuxCaptureAnalysis.md).
  `PortalTokenTests` drives the real `XdgDesktopPortal` against a fake
  portal on a private `dbus-daemon` (cases SKIP without the binary), pinning
  what Aurora sends (`persist_mode`, `restore_token`) and stores, and that
  every denial, call error, malformed reply, early-Response ordering and
  missing bus/portal settles the fd promise false instead of stalling
  `PipewireGrabber` for 60s. It cannot say whether a real backend honors
  persistence. Run it under ASan + LeakSanitizer
  (`-fsanitize=address,undefined`) after touching the callbacks; it is clean.

Grabber gotchas: `docs/lessons/input.md`.

## Building

Depends on Aurora core (`Contracts`, the `Input` interface), resolved via a
local sibling-directory path in `CMakeLists.txt` — expects this repo to sit
next to `Aurora/` on disk. Also needs, on Debian/Ubuntu:

```
sudo apt install libx11-dev libxext-dev libxrandr-dev libpipewire-0.3-dev libglib2.0-dev
```

Either capture backend can be skipped independently via
`-DAURORA_INPUT_LINUX_ENABLE_X11=OFF` / `-DAURORA_INPUT_LINUX_ENABLE_PIPEWIRE=OFF`
if its dev packages aren't available.

```
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
```
