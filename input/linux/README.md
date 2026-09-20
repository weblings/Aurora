# Aurora Input: Linux

Linux screen-capture input plugin for [Aurora core](../../) — implements
`Aurora::Input::IVideoInput` for both X11 and Wayland (via Pipewire/
`xdg-desktop-portal`), auto-selected at runtime by `SessionDispatch`.

Distilled from [huenicorn](https://gitlab.com/openjowelsofts/huenicorn)
(GPL-3.0), so this repo carries the same license forward — see `../../LICENSE`.

## Status

- `DummyGrabber` — ported, fully portable (no display needed), tested.
- `SessionDispatch` — the session-type decision logic from huenicorn's
  `GnuLinuxAdapter`, split out and tested as pure logic.
- `X11Grabber` — mechanically ported, builds against `libX11`/`libXext`/`libXrandr`.
  Not unit-testable (needs a real X11 display) — manual verification pending,
  same category as `output/hue`'s DTLS streaming.
- `PipewireGrabber`/`XdgDesktopPortal` — mechanically ported (Wayland capture
  via `xdg-desktop-portal`'s ScreenCast interface, plus Gamescope's direct
  Pipewire node). Gamescope-node matching and raw-buffer-to-`ImageData`
  conversion extracted as pure, tested helpers. Not unit-testable as a whole
  (needs a real Wayland session + portal backend) — see
  [`Analysis/LinuxCaptureAnalysis.md`](../../Analysis/LinuxCaptureAnalysis.md).

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
