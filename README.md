<p align="center">
  <img src="docs/README/Logo_Full_Dark.png" alt="Aurora" />
</p>

# Aurora

- A free Philips Hue ambilight driver for Windows and Linux — your screen and your audio drive your Hue lights in real time
- Two reactive modes: **video** (screen regions sampled per light zone) and **audio** (system sound rendered as drifting, bouncing color)
- Set up and tune it all from a built-in browser UI: bridge pairing, entertainment-area pick, zone mapping, pipeline tuning
- Runs entirely on your machine — your screen, audio, and settings never leave your computer or local network

**Browser demo (no install):** a zero-install taste of the effect with virtual lights, live at
[weblings.github.io/Aurora/web/demo/index.html](https://weblings.github.io/Aurora/index.html) —
or run it locally per [Try it without bulbs](#try-it-without-bulbs) below.

## Layout

One repo, with a directory per slice. You only build the ones for your platform:

- [`core/`](core) — capture/processing/output contracts, pipelines, orchestration
- [`app/windows`](app/windows) / [`app/linux`](app/linux) — the runnable apps; **start here to use Aurora**
- [`input/windows`](input/windows) / [`input/linux`](input/linux) — screen + audio capture plugins (DXGI on Windows; X11 / Wayland-Pipewire on Linux)
- [`output/hue`](output/hue) — Philips Hue entertainment-streaming output plugin
- [`web/ui`](web/ui) — the setup/control interface the apps serve in your browser
- [`web/demo`](web/demo) — the zero-install browser demo (Three.js scene, bundled sample media)

**Prebuilt binaries:** coming soon — releases with ready-to-run apps will appear on the App repos'
GitHub Releases pages. Until then, compile it yourself below (copy-paste, ~10 minutes).

## Try it without bulbs

No Hue bridge yet? The browser demo shows the effect with virtual lights:

1. **Install [Node.js](https://nodejs.org/)** (version 20 or newer).
   - **Windows:** `winget install OpenJS.NodeJS.LTS` (winget ships with Windows 10/11 already)
   - **macOS:** `brew install node` (needs [Homebrew](https://brew.sh))
   - **Linux (Debian/Ubuntu):** `sudo apt install nodejs npm`
2. **Get the code.** Either `git clone https://github.com/weblings/Aurora.git`, or on the
   [GitHub repo page](https://github.com/weblings/Aurora), click the green **Code**
   button → **Download ZIP**, then unzip it — no git required.
3. **Open a terminal in the `web/demo` folder** and run `npx serve .` (any static file server works).
4. **Open the URL it prints** in your browser.

## Quick Start (real lights)

You need a Philips Hue bridge with registered lamps, and an entertainment area defined through
Philips' official app.

1. **Install build tools.**
   - **Windows:** Visual Studio's "Desktop development with C++" workload, plus
     [vcpkg](https://github.com/microsoft/vcpkg) for Aurora core's OpenCV dependency.
   - **Linux (Debian/Ubuntu):** `sudo apt install build-essential cmake libopencv-dev libcurl4-openssl-dev libmbedtls-dev libx11-dev libxext-dev libxrandr-dev libglib2.0-dev libpipewire-0.3-dev libaubio-dev`
2. **Get the code.** Clone this repo (or download it as a ZIP from its repo page):
   `git clone https://github.com/weblings/Aurora.git`
3. **Build the app.**
   - **Linux:** `cmake --preset linux-app` then `cmake --build build/linux-app`
   - **Windows** (in a Visual Studio developer prompt):
     `cmake --preset windows-app -DCMAKE_TOOLCHAIN_FILE=<path-to-vcpkg>/scripts/buildsystems/vcpkg.cmake`
     then `cmake --build build/windows-app --config Release`
4. **Run it** (`build/linux-app/aurora-app-linux`, or
   `build/windows-app/Release/aurora-app-windows.exe` on Windows), then **open the printed URL** in your browser. The setup UI walks you through
   bridge pairing (press your bridge's button when asked), picking an entertainment area,
   and mapping lights to screen regions. Your lights should follow your screen within seconds.

## Troubleshooting

**My lights stream solid black (Windows)**
- A monitor Windows still lists as attached can be genuinely powered off and reads back as valid
  all-black data. In the setup UI's device/monitor setting, pick the right monitor explicitly
  (e.g. `\\.\DISPLAY1`) instead of auto/primary.

**Screen picker never appears (Linux Wayland)**
- The capture portal asks you to pick a screen share source on first run. If it stopped appearing,
  delete the `restoreToken` line in `~/.config/aurora/config.json` and restart the app.

**No zones light up on first run**
- Every zone starts inactive by default. Open zone mapping in the setup UI, assign screen regions
  to your lights, and save the profile — it reloads automatically next launch.

## FAQ

**Do I need to know C++ or web development to use this?**
No — Quick Start above is copy-paste, with each step explained.

**What's Huenicorn?**

[Huenicorn](https://gitlab.com/openjowelsofts/huenicorn) by OpenJowel is a free Philips Hue screen
synchronizer for GNU/Linux. Aurora's capture math, Hue streaming wire format, and setup-flow patterns are distilled from it into modular C++ — without that amazing tech
foundation, this project would not have been attempted. If you're on Linux and want the original
single-binary experience, use Huenicorn directly.

## For developers

- Each slice's README covers its own status, build flags, and tests;
  `ctest --test-dir build/linux-app` (or `build/windows-app`) runs the full native suite.
- `docs/` holds the distillation notes (capture, Hue output, browser strategy), lessons, and build history.

## License

Aurora is licensed under the [GNU General Public License v3.0 or later](LICENSE) — same as
[Huenicorn](https://gitlab.com/openjowelsofts/huenicorn), which its logic is distilled from.
