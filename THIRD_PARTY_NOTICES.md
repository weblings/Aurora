# Third-party notices

Aurora is GPL-3.0 ([LICENSE](LICENSE)). This file records material taken from other projects, with the copyright and licence text their licences ask us to keep. It is a best-effort record, not legal advice.

Each entry says how the material is used:

- **Incorporated:** code or assets copied or adapted into Aurora. The licence text or the licence name and the list of files is kept here.
- **Reference only:** studied for ideas, algorithms or behaviour; no code or assets copied. Listed so the lineage is visible, with what was learned. Licence text is not needed for these.

If a reference-only project later becomes a source of ported code, move it to Incorporated and keep its notice in the ported files.

## Huenicorn (GPL-3.0-only) -- incorporated

- Project: <https://gitlab.com/openjowelsofts/huenicorn> by OpenJowel. Its `LICENSE.txt` is the GNU GPL version 3 text and its README says "GNU GPLv3"; neither says "or any later version", so it is treated as GPL-3.0-only. Its source files carry no copyright headers.
- Files in Aurora ported from it (each has a comment saying so, compared with the `huenicorn-fork` checkout, 2026-11-10):
  - Near-verbatim: `core/Contracts/.../UV.hpp`, `Interpolation.hpp`, `ImageData.hpp`; `core/Input/.../MonitorData.hpp`; `core/Processing/.../ImageProcessing.hpp`; `input/linux/.../XdgDesktopPortal.hpp`.
  - Adapted: `core/Contracts/.../Color.hpp` (generic parts), `core/Processing/src/ImageProcessing.cpp`, `input/linux/.../DummyGrabber.hpp`, `X11Grabber.hpp/.cpp`, `PipewireGrabber.hpp`, `XdgDesktopPortal.cpp`.
  - Design and logic carried over: `SessionDispatch.hpp`, `core/Runtime/.../FrameCompositor.hpp`, `SubsampleDefaults.hpp`, and the HTTP server shapes in `core/Network/`.
- Aurora's `LICENSE` is the GPL-3 text. Those files stay under GPL-3.0 and are not offered under later versions.
- `XdgDesktopPortal.cpp/.hpp` also say they adapt <https://codeberg.org/metamuffin/xdg-dp-start> and OBS Studio source (OBS is GPL-2.0-or-later). The metamuffin licence has not been checked.

## Vidstack media-icons (MIT) -- incorporated

Source: <https://github.com/vidstack/media-icons> (npm `media-icons`). Used in `web/ui/icons` (back arrow, add, chevrons, play, pause, stop, search, fullscreen enter and exit, x mark) and, since `Aurora-s1t7.5`, through Grille (`@weblings/grille` `0.1.0-dev.9`), whose icons the graph editor and its mock use; the paths ship in the built editor.

```
MIT License

Copyright (c) 2023 Rahim Alwer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Zest Free icons (MIT-style "Zest Free License") -- incorporated

Source: <https://github.com/32pixelsCo/zest-icons> via SVG Repo. Used for `web/ui/icons/power-svgrepo-com.svg`, `Undo.svg`, `Redo.svg` and `minus.svg`, and, through Grille, the graph editor's undo, redo, minus and warning icons (Aurora's own `web/ui/icons/warning.svg` is no longer used by the editor).

```
Zest Free License

Copyright © 2019-2021 32pixels, LLC.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Hyperion (MIT) -- reference only

- Project: <https://github.com/hyperion-project/hyperion.ng>. Cloned and read during planning; no Hyperion code is in Aurora (no source file names it).
- What informed Aurora: the external-control API shape, error display (device faults held and cleared by the server), the Home Assistant output, and, for the 1.1.1 capture work (`Aurora-wqzp`), ideas from its Mac grabber: a frame-interval cap, filtering ScreenCaptureKit idle frames, late copy, automatic capture resolution, and its fixed 25 Hz grab rate.
- Its Windows `DDAGrabber` was checked for HDR handling and has none, so it is not a reference for the HDR work below.
- Any code ported from it later would keep its MIT notice.

## Windows HDR capture references -- reference only

`Aurora-wqzp.12` (`input/windows/src/WindowsGrabber.cpp`, `ScRgbConversion.cpp`) was written by Aurora. The approach was informed by reading:

- OBS Studio (GPL-2.0-or-later): `libobs-d3d11/d3d11-duplicator.cpp` and `d3d11-subsystem.cpp`.
- RustDesk (AGPL-3.0, <https://github.com/rustdesk/rustdesk>), PR #16033: `libs/scrap/src/dxgi/hdr.rs` and `mod.rs`.
- GStreamer `d3d11screencapturesrc` (LGPL-2.1-or-later): read as a reference; not compared in detail.

Compared line by line against OBS and RustDesk on 2026-11-10. Shared with them, and with Microsoft's documented API usage:

- `DuplicateOutput1` with the format list `[R16G16B16A16_FLOAT, B8G8R8A8_UNORM]` (identical in OBS and RustDesk).
- Reading the SDR white level by `GetDisplayConfigBufferSizes`, `QueryDisplayConfig`, matching the source's GDI name, then `DisplayConfigGetDeviceInfo(DISPLAYCONFIG_SDR_WHITE_LEVEL)`. That call sequence is the only way to use this API and is the same in all three. Aurora's code is its own C++ with early returns for advanced-colour state.
- Divide by the white level, clamp, then the standard sRGB transfer (the IEC 61966-2-1 constants are the same in every implementation).
- Re-reading the white level about once a second (RustDesk).

Different in Aurora: conversion on the CPU through a 65,536-entry half-float lookup table (RustDesk uses a GPU pixel shader, OBS a shader with a tonemap multiplier); HDR state from DisplayConfig advanced-colour info (RustDesk uses `IDXGIOutput6::GetDesc1`); Aurora's own structure, naming and tests. No code was copied. Aurora's code comments do not name these projects; the bead, `docs/lessons/input.md` and `docs/log/2026-10-13-wqzp12-windows-hdr-capture.md` do.

## Other credits

Logo artwork and demo assets are credited in [README.md](README.md) and [web/demo/README.md](web/demo/README.md).
