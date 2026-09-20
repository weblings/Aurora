# Aurora App: Linux

The Linux test app tying [Aurora](../Aurora) core, [Aurora-Input-Linux](../Aurora-Input-Linux),
and [Aurora-Output-Hue](../Aurora-Output-Hue) together into one running
process: capture the screen, crop/color per zone, stream to Hue lights.

Distilled from [huenicorn](https://gitlab.com/openjowelsofts/huenicorn)
(GPL-3.0), so this repo carries the same license forward — see `LICENSE`.

## Status

A test script, not yet a real product app — see
[`Aurora/Analysis/ImplementationPlan.md`](../Aurora/Analysis/ImplementationPlan.md)
phase 3 for what's still missing (a pairing flow, a zone-mapping UI).

- **`Registry`** — name → factory lookup for this binary's compiled-in
  plugins. Tested (`tests/RegistryTests.cpp`) against fake input/output
  fixtures.
- **`main.cpp`** — registers whichever plugins this build was compiled with
  (`AURORA_APP_ENABLE_LINUX_INPUT`/`_HUE_OUTPUT`), picks which of them to
  actually run from `Config::activeInputName()`/`activeOutputNames()` (or
  sensible defaults if unconfigured), and drives `Orchestrator::update()`
  in a real timed loop until `Ctrl+C`. Not unit-tested — real display,
  real bridge, real threading, same category as `X11Grabber`/`Streamer`.

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
  until a real UI exists. `configRoot` is `$AURORA_CONFIG_DIR`, or
  `$HOME/.config/aurora` if unset.

## Building

Expects this repo to sit next to `Aurora/`, `Aurora-Input-Linux/`, and
`Aurora-Output-Hue/` on disk (or toggle `AURORA_APP_ENABLE_LINUX_INPUT`/
`_HUE_OUTPUT` off to skip the ones you don't have). See those repos' own
READMEs for their native dependencies (X11/Pipewire/libcurl/Mbed TLS).

```
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure

AURORA_HUE_BRIDGE_ADDRESS=... AURORA_HUE_USERNAME=... AURORA_HUE_CLIENTKEY=... ./build/aurora-app-linux
```
