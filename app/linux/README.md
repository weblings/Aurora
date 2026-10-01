# Aurora App: Linux

The Linux test app tying [Aurora core](../../), [input/linux](../../input/linux),
and [output/hue](../../output/hue) together into one running
process: capture the screen, crop/color per zone, stream to Hue lights.

Distilled from [huenicorn](https://gitlab.com/openjowelsofts/huenicorn)
(GPL-3.0), so this repo carries the same license forward — see `../../LICENSE`.

## What's here

- **`Registry`** — name → factory lookup for this binary's compiled-in
  plugins. Tested (`tests/RegistryTests.cpp`) against fake input/output
  fixtures.
- **`main.cpp`** — registers whichever plugins this build was compiled with
  (`AURORA_APP_ENABLE_LINUX_INPUT`/`_HUE_OUTPUT`), picks which of them to
  actually run from `Config::activeInputName()`/`activeOutputNames()` (or
  sensible defaults if unconfigured), and drives `Orchestrator::update()`
  in a real timed loop until `Ctrl+C`. Not unit-tested — real display,
  real bridge, real threading, same category as `X11Grabber`/`Streamer`.
- Pairing, zone mapping, and settings are done in the WebUI
  (`SettingsRoutes`/`ZoneRoutes`/`PairingRoutes`), not here.

## Configuration

- Hue credentials come from pairing in the WebUI, or from
  `AURORA_HUE_BRIDGE_ADDRESS`, `AURORA_HUE_USERNAME`, `AURORA_HUE_CLIENTKEY`
  in the environment. If neither supplies them, `hue` isn't registered as an
  available output.
- If the bridge has more than one entertainment configuration, the WebUI's
  zone-select step picks one; `AURORA_HUE_ENTERTAINMENT_CONFIG_ID` presets it.
- `configRoot` is `$AURORA_CONFIG_DIR`, or `$HOME/.config/aurora` if unset.

## Building

Full from-source reference (prerequisites, presets, install tree):
[docs/Building.md](../../docs/Building.md).

Run:
```
AURORA_HUE_BRIDGE_ADDRESS=... AURORA_HUE_USERNAME=... AURORA_HUE_CLIENTKEY=... ./build/bin/Aurora
```

Append `--fresh` to rehearse first-run flows (NUX, pairing) against a
guaranteed-empty temp config root instead of your real one.
