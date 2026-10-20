# Brightness floor stage (Aurora-6v36)

Id: 6v36-brightness-floor

Closed 2026-10-16. Policy from Aurora-pngj, recorded in [[home-assistant-output]]. Runs after the gain stage ([[5ipy7-global-brightness]]) so gain 0 and a black scene follow one rule.

## Done

- `Runtime::BrightnessFloor` (`core/Runtime`): pure per-zone Frame-to-Frame function, `dt`-driven so tests use a fake clock. Policies `Off` (returns the input, Hue byte-identical), `HoldFloor` (largest channel raised to the floor, hue kept; exact black holds the last non-black hue, gray if none seen), `SwitchOff` (as hold, then real black after `holdSeconds` of exact black; any non-black frame resets the timer). Zones that leave the frame are forgotten.
- `frame.floor` node wraps it (params `policy` off/hold/switchOff, `floor` 0-1, `holdSeconds`). Built-in Video and Audio graphs insert one per output between `frame.gain` and `output.send`, default off.

## Verification

- `FrameNodesTests`: credits-style sequence (orange step then black frames) for off, hold and switchOff on a 0.5 s fake clock, `off` equal to input including gamma, gain 0 into hold. Full core suite 366/366 (WSL, `build/core-test`).

## Left open

- Per-output policy is not yet in Config or the Output section (Aurora-d7s). Floor value and hold time await real-bulb measurement (Aurora-4zr.9).
- The "output declares brightness 0 means off" flag is not on `IOutput`. Until the HA output (Aurora-cyw) exists, the node's `policy` param is the switch.

## Lessons

- None.
