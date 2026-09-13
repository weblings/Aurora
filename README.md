# Aurora Input: Linux

Linux screen-capture input plugin for [Aurora](../Aurora) — implements
`Aurora::Input::IInput` (X11 today; Pipewire/Wayland is a follow-up).

Distilled from [huenicorn](https://gitlab.com/openjowelsofts/huenicorn)
(GPL-3.0), so this repo carries the same license forward — see `LICENSE`.

## Status

- `DummyGrabber` — ported, fully portable (no display needed), tested.
- `SessionDispatch` — the session-type decision logic from huenicorn's
  `GnuLinuxAdapter`, split out and tested as pure logic.
- `X11Grabber` — mechanically ported, builds against `libX11`/`libXext`/`libXrandr`.
  Not unit-testable (needs a real X11 display) — manual verification pending,
  same category as `Aurora-Output-Hue`'s DTLS streaming.
- **Not yet ported:** `PipewireGrabber`/`XdgDesktopPortal` (Wayland capture via
  `xdg-desktop-portal`) — see [`Aurora/Analysis/LinuxCaptureAnalysis.md`](../Aurora/Analysis/LinuxCaptureAnalysis.md)
  for why this was scoped out of the first pass.

## Building

Depends on Aurora core (`Contracts`, the `Input` interface), resolved via a
local sibling-directory path in `CMakeLists.txt` — expects this repo to sit
next to `Aurora/` on disk. Also needs X11 dev headers
(`libx11-dev libxext-dev libxrandr-dev` on Debian/Ubuntu).

```
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
```
