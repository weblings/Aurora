# Aurora App: Mac

The macOS app tying [Aurora core](../../), [input/mac](../../input/mac), and
[output/hue](../../output/hue) together into one process: capture the screen
(and optionally system audio), compute per-zone colors, stream to Hue lights.
Ported from [app/linux](../linux) minus the X11/PipeWire backend selection --
macOS has one capture API.

Support statement (supported macOS/hardware): see the root
[README](../../README.md#quick-start). Design and history: [[mac-video-capture]],
[[mac-audio]], [[mac-permissions]], [[mac-tray-parity]], [[mac-notarization]].

## What it is

- **`Aurora.app`**, an `LSUIElement` menu-bar agent: an `NSStatusItem` with
  Launch UI / Stop (`TrayIcon.mm`), no Dock icon. A second launch reopens the
  browser (`InstanceLock`) instead of starting another instance. The `.app`
  bundle exists so Aurora holds its own Screen Recording grant instead of
  Terminal's.
- **`main.cpp`** registers the compiled-in plugins, picks the active ones from
  config, and runs the pipeline tick loop on a worker thread while the main
  thread pumps the tray (a tray menu being open must not stall the pipeline).
  Hue credentials come from pairing in the WebUI, or from
  `AURORA_HUE_BRIDGE_ADDRESS` / `_USERNAME` / `_CLIENTKEY` in the environment.
- **WebUI:** served from `web/ui`. Probe order is `AURORA_WEBUI_DIR` (override)
  > the checkout's `web/ui`, baked in at configure time > the embedded copy in
  the binary. So a build from this checkout serves your working-tree WebUI
  edits with no rebuild; only a moved tree or a bundled release falls back to
  the embedded copy (which is what ships, so test it before a release).
- Flags: `--fresh` rehearses first-run flows (NUX, pairing) against a cleared
  temp config root (`$TMPDIR/aurora-fresh`); `--fake-hue` presets the fake
  bridge from [tools/fake-hue-bridge](../../tools/fake-hue-bridge).
  `--help` prints usage and exits; `--version` prints the version and exits;
  any other unrecognized flag errors with usage and a non-zero exit instead
  of booting.

## Building

Use the `mac-app` preset from the repo root; setup (Xcode CLT, Homebrew
packages, the `mbedtls@3` pin) is in
[CONTRIBUTING.md](../../CONTRIBUTING.md#platform-notes).

```sh
cmake --preset mac-app
cmake --build build/mac-app
ctest --test-dir build/mac-app --output-on-failure
open build/mac-app/bin/Aurora.app   # or run Contents/MacOS/Aurora from a terminal for logs
```

This slice also builds standalone (`cmake -S . -B build` here), needing
`core/`, `input/mac`, and `output/hue` alongside; toggle with
`AURORA_APP_ENABLE_MAC_INPUT`, `AURORA_APP_ENABLE_HUE_OUTPUT`, and
`AURORA_APP_ENABLE_MAC_AUDIO_INPUT` (off skips the aubio dependency).

Gotchas worth reading before touching AppKit, the run loop, or signing:
`docs/lessons/macos-gui.md`. The release zip is a manual step
(`tools/mac/sign-notarize.sh`; see [[mac-notarization]]).
