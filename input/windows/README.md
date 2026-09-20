# Aurora Input: Windows

Windows screen-capture input plugin for [Aurora core](../../) — implements
`Aurora::Input::IVideoInput` for the Windows desktop.

Distilled from [huenicorn](https://gitlab.com/openjowelsofts/huenicorn)
(GPL-3.0), so this repo carries the same license forward — see `../../LICENSE`.
huenicorn's own Windows adapter never implemented capture at all
(`WindowsAdapter::_createGrabber` returns `nullptr`), so there's no upstream
capture code to port here — see
[`docs/WindowsInputAnalysis.md`](../../docs/WindowsInputAnalysis.md)
for the DXGI Desktop Duplication research this plugin is built against instead.

## Status

- `DummyGrabber` — ported from `input/linux`'s copy, tested. No OS
  dependency, useful as a fallback/dev target.
- `WindowsGrabber` (DXGI Desktop Duplication) — not started. See
  `WindowsInputAnalysis.md` for the verified API shape, failure modes, and
  RAII/buffer-handling notes to build it against.

## Building

Depends on Aurora core (`Contracts`, the `Input` interface), resolved via a
local sibling-directory path in `CMakeLists.txt` — expects this repo to sit
next to `Aurora/` on disk. Needs a native Windows C++ toolchain (Visual
Studio's "Desktop development with C++" workload — MSVC, Windows SDK,
CMake tools) plus [vcpkg](https://github.com/microsoft/vcpkg) to supply
Aurora core's own OpenCV/glm/nlohmann_json dependencies on Windows (no
Windows equivalent of `apt` to install them from directly). `WindowsGrabber`
itself needs no extra package once written — DXGI/Direct3D 11 ship with the
Windows SDK, no vcpkg package required for them.

```
cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE=<path-to-vcpkg>/scripts/buildsystems/vcpkg.cmake
cmake --build build
ctest --test-dir build --output-on-failure
```
