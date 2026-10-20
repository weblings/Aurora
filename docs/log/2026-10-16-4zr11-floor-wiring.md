# Brightness floor wiring (Aurora-4zr.11)

Id: 4zr11-floor-wiring

Closed 2026-10-16. Connects the `frame.floor` stage ([[6v36-brightness-floor]]) to per-output config and the Dashboard, per the policy in [[home-assistant-output]].

## Done

- `IOutput::zeroBrightnessMeansOff()` (default false, so Hue is unchanged). `Registry::zeroOffOutputNames()` builds each registered output once to ask it. All three app `/api/capabilities` routes add `zeroOffOutputs`.
- `ConfigData::outputFloors` (name to `{policy, floor, holdSeconds}`, defaults off / 0.05 / 2 s). Setter clamps floor 0-1 and hold 0-60 and maps unknown policies to off. Persisted in config.json, `Hot` in both modes.
- `GET/PUT /api/config` carry `outputFloors`. A PUT entry merges into the saved one, so a partial entry keeps omitted fields.
- Built-in Video and Audio graph overlays set policy, floor and holdSeconds on each output's floor node.
- Dashboard Output section: segmented Off / Hold dim / Switch off plus Floor and Hold time sliders (hold only for switch off), drawn only when the active output is in `zeroOffOutputs`. Demo vendor copy re-synced.

## Verification

- New tests: config round trip and clamping, hot plan, overlay per output, registry flag. Core suite 370/370 (MSVC, `build-core-test-win`). Web node tests pass.
- Correction: `DashboardScreen.test.mjs` failed (its `fakeScreen()` skips the constructor, so `zeroOffOutputs` was undefined). Fixed in the fixture during the commit review, all web tests now pass.
- Not checked in a browser. No output declares the flag yet, so the control stays hidden until the HA output exists.

## Left open

- HA output must override `zeroBrightnessMeansOff()` and add its `OUTPUT_SECTIONS` entry (Aurora-cyw).
- Defaults 0.05 / 2 s stay placeholders until real-bulb measurement (Aurora-4zr.9).

## Lessons

- None.
