# Aurora Input: Windows

Windows screen-capture input plugin for [Aurora core](../../) — implements
`Aurora::Input::IVideoInput` for the Windows desktop.

Distilled from [huenicorn](https://gitlab.com/openjowelsofts/huenicorn)
(GPL-3.0), so this repo carries the same license forward — see `../../LICENSE`.
huenicorn's own Windows adapter never implemented capture at all
(`WindowsAdapter::_createGrabber` returns `nullptr`), so there's no upstream
capture code to port here — see
[`docs/archive/WindowsInputAnalysis.md`](../../docs/archive/WindowsInputAnalysis.md)
for the DXGI Desktop Duplication research this plugin is built against instead.

## What's here

- `WindowsGrabber` — DXGI Desktop Duplication screen capture. Not
  unit-testable (needs a real display).
- `AudioGrabber` — system audio capture.
- `DummyGrabber` — no OS dependency; a fallback and dev target.
- `InputControlDescriptors` — the per-platform control descriptor table.

Grabber gotchas: `docs/lessons/input.md`.

## Building

Depends on Aurora core (`Contracts`, the `Input` interface), resolved via a
relative path in `CMakeLists.txt`. Needs a native Windows C++ toolchain (MSVC)
and vcpkg for core's dependencies; the full recipe is in
[docs/Building.md](../../docs/Building.md). Standalone:

```
cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE=<path-to-vcpkg>/scripts/buildsystems/vcpkg.cmake
cmake --build build
ctest --test-dir build --output-on-failure
```
