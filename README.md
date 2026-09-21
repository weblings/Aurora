<p align="center">
  <img src="docs/README/Logo_Full_Dark.png" alt="Aurora" />
</p>

# Aurora

- A modular, multiplatform processor of inputs to generate outputs. Today that's video / audio to Hue light colors.
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

**Prebuilt binaries:** coming soon — releases with ready-to-run apps will appear on the App repos'
GitHub Releases pages. Until then, compile it yourself below (copy-paste, ~10 minutes).

## Quick Start

You need a Philips Hue bridge with registered lamps, and an entertainment area defined through
Philips' official app.

1. **Install build tools.** All platforms need CMake 3.19+ (the presets won't parse below it —
   check with `cmake --version`). If yours is older, see Troubleshooting.
   - **Windows:** Visual Studio's "Desktop development with C++" workload (MSVC compiler
     + Windows SDK for screen capture), [CMake](https://cmake.org/download/) itself
     (`winget install Kitware.CMake` if VS didn't supply one), and OpenCV for Aurora core
     (`find_package(OpenCV REQUIRED COMPONENTS imgproc)`). Easiest is Chocolatey:
     `choco install opencv -y`, then point CMake at it with
     `-DOpenCV_DIR="C:/tools/opencv/build"` (or set that path as the `OpenCV_DIR`
     environment variable). A vcpkg-built OpenCV
     ([vcpkg](https://github.com/microsoft/vcpkg) `install opencv`) works too —
     pass its toolchain file instead (see step 3).
   - **Linux (Debian/Ubuntu):** `sudo apt install build-essential cmake libopencv-dev libcurl4-openssl-dev libmbedtls-dev libx11-dev libxext-dev libxrandr-dev libglib2.0-dev libpipewire-0.3-dev libaubio-dev`
2. **Get the code.** Clone this repo (or download it as a ZIP from its repo page):
   `git clone https://github.com/weblings/Aurora.git`
3. **Build the app.**
   - **Linux:** `cmake --preset linux-app` then `cmake --build build/linux-app`
   - **Windows** (in a Visual Studio developer prompt):
     `cmake --preset windows-app -DCMAKE_TOOLCHAIN_FILE=<path-to-vcpkg>/scripts/buildsystems/vcpkg.cmake`
     then `cmake --build build/windows-app --config Release`
4. **Run it.** In a terminal, run `./build/linux-app/aurora-app-linux`
   (`.\build\windows-app\Release\aurora-app-windows.exe` on Windows).
   The app prints its URL in the terminal — **Ctrl+click the link** to open it.
5. Follow setup flow for bridge pairing (press your bridge's button when asked), picking an entertainment area,
   and mapping lights to screen regions. Enjoy!

## Troubleshooting

**I'm not seeing audio reacting**
- If no audio was actively playing before you toggled to audio the grabber might have trouble finding it. Switch back to video, play some audio, then try switching to audio.

**CMake too old, or the old one keeps getting picked up (Linux)**
- The presets need CMake 3.19+. If apt's copy is older (seen on Ubuntu 24.04), safest is a venv:
  `python3 -m venv ~/.venvs/build`, activate it, `pip install cmake`, and run configure from
  inside it — the venv's `bin` leads `PATH`, so its cmake is the one everything finds and the apt
  copy can never shadow it. A bare `pip install cmake` outside a venv works too, but `~/.local/bin`
  sorts after `/usr/bin/cmake` on some setups (and subshells may not inherit your `PATH` tweaks),
  so the old one can still win there.

## FAQ

**What's Huenicorn?**

[Huenicorn](https://gitlab.com/openjowelsofts/huenicorn) by OpenJowel is a free Philips Hue screen
synchronizer for GNU/Linux. Aurora's capture math, Hue streaming wire format, and setup-flow patterns are distilled from it into modular C++ — without that amazing tech
foundation, this project would not have been attempted.

## For developers

- Each slice's README covers its own status, build flags, and tests;
  `ctest --test-dir build/linux-app` (or `build/windows-app`) runs the full native suite.
- `docs/` holds the distillation notes (capture, Hue output, browser strategy), lessons, and build history.

## License

Aurora is licensed under the [GNU General Public License v3.0 or later](LICENSE) — same as
[Huenicorn](https://gitlab.com/openjowelsofts/huenicorn), which its logic is distilled from.
