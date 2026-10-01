# Aurora App: Windows

The Windows test app tying [Aurora core](../../), [input/windows](../../input/windows),
and [output/hue](../../output/hue) together into one running
process: capture the screen, crop/color per zone, stream to Hue lights.

Distilled from [huenicorn](https://gitlab.com/openjowelsofts/huenicorn)
(GPL-3.0), so this repo carries the same license forward — see `../../LICENSE`.

## What's here

- **`Registry`** — identical to `app/linux`'s copy (platform-neutral, no OS
  dependency): name → factory lookup for this binary's compiled-in plugins.
  Tested (`tests/RegistryTests.cpp`) against fake input/output fixtures.
- **`main.cpp`** — registers whichever plugins this build was compiled with
  (`AURORA_APP_ENABLE_WINDOWS_INPUT`/`_HUE_OUTPUT`), picks which of them to
  actually run from `Config::activeInputName()`/`activeOutputNames()` (or
  sensible defaults if unconfigured), and drives `Orchestrator::update()`
  in a real timed loop until `Ctrl+C`/console close. Not unit-tested — real
  display, real bridge, real threading, same category as `WindowsGrabber`/
  `Streamer`. Two platform differences from `app/linux`'s copy, not reusable
  as-is: `SetConsoleCtrlHandler` instead of `std::signal` (Windows has no
  `SIGINT`/`SIGTERM`), and `%APPDATA%\Aurora` instead of
  `$HOME/.config/aurora` for the config root (matching huenicorn's own
  `WindowsAdapter::getConfigFilePath()` convention).
- One capture backend (`WindowsGrabber`, DXGI Desktop Duplication), so there
  is no auto-select dispatch layer as on Linux.
- Pairing, zone mapping, and settings are done in the WebUI
  (`SettingsRoutes`/`ZoneRoutes`/`PairingRoutes`), not here.

## Configuration

- Hue credentials come from pairing in the WebUI, or from
  `AURORA_HUE_BRIDGE_ADDRESS`, `AURORA_HUE_USERNAME`, `AURORA_HUE_CLIENTKEY`
  in the environment. If neither supplies them, `hue` isn't registered as an
  available output.
- `AURORA_HUE_ENTERTAINMENT_CONFIG_ID` presets the entertainment
  configuration (otherwise the WebUI's zone-select step picks one).
- `configRoot` is `%AURORA_CONFIG_DIR%`, or `%APPDATA%\Aurora` if unset.
- **Monitor liveness can't be detected.** `WindowsGrabber` selects the primary
  monitor by default; a monitor Windows still lists as attached can be
  powered off and reads back as valid all-black data, with no way to detect
  that via the API (see [`docs/lessons/input.md`](../../docs/lessons/input.md)).
  If the app streams solid black, set `activeMonitorName` in
  `<configRoot>/config.json` to the right monitor (e.g. `"\\\\.\\DISPLAY1"`, as
  listed by `WindowsGrabber::monitors()`; empty means auto/primary). It is a
  real persisted `Config` setting, and `X11Grabber` resolves it the same way.

## Building

Full from-source reference (prerequisites, presets, portable trees):
[docs/Building.md](../../docs/Building.md).

Run:
```
$env:AURORA_HUE_BRIDGE_ADDRESS = "..."; $env:AURORA_HUE_USERNAME = "..."; $env:AURORA_HUE_CLIENTKEY = "..."
./build/bin/Release/Aurora.exe
```

Append `--fresh` to rehearse first-run flows (NUX, pairing) against a
guaranteed-empty temp config root instead of your real one.
