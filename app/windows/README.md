# Aurora App: Windows

The Windows test app tying [Aurora core](../../), [input/windows](../../input/windows),
and [output/hue](../../output/hue) together into one running
process: capture the screen, crop/color per zone, stream to Hue lights.

Distilled from [huenicorn](https://gitlab.com/openjowelsofts/huenicorn)
(GPL-3.0), so this repo carries the same license forward — see `../../LICENSE`.

## Status

A test script, not yet a real product app — see
[`Analysis/ImplementationPlan.md`](../../Analysis/ImplementationPlan.md)
phase 3 for what's still missing (a pairing flow, a zone-mapping UI).

- **`Registry`** — identical to `app/linux`'s copy (platform-neutral,
  no OS dependency) — name → factory lookup for this binary's compiled-in
  plugins. Tested (`tests/RegistryTests.cpp`) against fake input/output
  fixtures.
- **`main.cpp`** — registers whichever plugins this build was compiled with
  (`AURORA_APP_ENABLE_WINDOWS_INPUT`/`_HUE_OUTPUT`), picks which of them to
  actually run from `Config::activeInputName()`/`activeOutputNames()` (or
  sensible defaults if unconfigured), and drives `Orchestrator::update()`
  in a real timed loop until `Ctrl+C`/console close. Not unit-tested — real
  display, real bridge, real threading, same category as `WindowsGrabber`/
  `Streamer`. Two platform differences from `app/linux`'s copy, not
  reusable as-is: `SetConsoleCtrlHandler` instead of `std::signal` (Windows
  has no `SIGINT`/`SIGTERM`), and `%APPDATA%\Aurora` instead of
  `$HOME/.config/aurora` for the config root (matching huenicorn's own
  `WindowsAdapter::getConfigFilePath()` convention).
- Only one real capture backend exists on Windows so far (`WindowsGrabber`,
  DXGI Desktop Duplication) — unlike the Linux app, there's no auto-select
  dispatch layer here; `"windows"` just is DXGI directly.

## Known stopgaps (not bugs — features that don't exist yet elsewhere)

- **No pairing flow.** Hue credentials come from environment variables:
  `AURORA_HUE_BRIDGE_ADDRESS`, `AURORA_HUE_USERNAME`, `AURORA_HUE_CLIENTKEY`.
  If any are unset, `hue` just isn't registered as an available output.
- **No entertainment-config picker.** If the bridge has more than one
  entertainment configuration, set `AURORA_HUE_ENTERTAINMENT_CONFIG_ID` to
  the right one's UUID — otherwise `HueOutput` picks arbitrarily.
- **No zone-mapping UI.** On first run every zone comes back inactive
  (`reconcileZoneMap`'s default) — hand-edit
  `<configRoot>/profiles/hue.json` to mark zones active with real UV rects
  until a real UI exists. `configRoot` is `%AURORA_CONFIG_DIR%`, or
  `%APPDATA%\Aurora` if unset.
- **No monitor-liveness detection.** `WindowsGrabber` selects the primary
  monitor by default; a monitor Windows still lists as attached can be
  genuinely powered off and reads back as valid all-black data with no way
  to detect that via the API — see
  [`Analysis/lessons/input.md`](../../Analysis/lessons/input.md).
  If the app is streaming solid black, hand-edit `<configRoot>/config.json`'s
  `activeMonitorName` to the right monitor's name (e.g. `"\\\\.\\DISPLAY1"`
  — as shown by `WindowsGrabber::monitors()`, empty means auto/primary).
  This field is a real `Config` setting (persisted, round-tripped, the same
  kind of thing a future setup UI would read/write), not a Windows-only
  stopgap — `X11Grabber` on Linux resolves it the same way.

## Building

Expects `core/`, `input/windows/`, and
`output/hue/` alongside it in this repo (or toggle `AURORA_APP_ENABLE_WINDOWS_INPUT`/
`_HUE_OUTPUT` off to skip the ones you don't have). Needs a native Windows
C++ toolchain (Visual Studio's "Desktop development with C++" workload) plus
[vcpkg](https://github.com/microsoft/vcpkg) for Aurora core's OpenCV
dependency — see those repos' own READMEs for details.

```
cmake -S . -B build -G "Visual Studio 17 2022" -A x64 -DCMAKE_TOOLCHAIN_FILE=<path-to-vcpkg>/scripts/buildsystems/vcpkg.cmake
cmake --build build --config Release
ctest --test-dir build -C Release --output-on-failure

$env:AURORA_HUE_BRIDGE_ADDRESS = "..."; $env:AURORA_HUE_USERNAME = "..."; $env:AURORA_HUE_CLIENTKEY = "..."
./build/Release/aurora-app-windows.exe
```
