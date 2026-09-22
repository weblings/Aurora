# Building Aurora from source

End users: start at the root [README Quick Start](../README.md#quick-start)
(prebuilt 1.0.1 zips). This page is the full from-source reference for
contributors, packagers, and unsupported platforms.

## Presets (full-app builds)

| Preset | Binary | Layout |
|---|---|---|
| `linux-app` | `build/linux-app/bin/Aurora` | single-config |
| `windows-app` | `build/windows-app/bin/Release/Aurora.exe` | multi-config (`bin/<Config>`) |

```sh
cmake --preset linux-app        # or windows-app
cmake --build build/linux-app   # --config Release on Windows
ctest --test-dir build/linux-app --output-on-failure
```

Per-slice presets live in `CMakePresets.json`; the root `CMakeLists.txt` is a
thin superbuild (each slice pulls `core/` itself via `FetchContent`). Core's
own suite is not part of any preset — build it standalone with
`cmake -S core`.

## Prerequisites

All platforms need CMake (the owner pins the version — see the root
`CMakeLists.txt`) and OpenCV (`find_package(OpenCV REQUIRED COMPONENTS
imgproc)`).

- **Windows:** Visual Studio's "Desktop development with C++" workload (MSVC
  compiler + Windows SDK for screen capture), plus a CMake install if VS
  didn't supply one (`winget install Kitware.CMake`). OpenCV via Chocolatey
  (`choco install opencv -y`, then `-DOpenCV_DIR="C:/tools/opencv/build"` or
  the `OpenCV_DIR` env var) or via vcpkg (`install opencv`, passing its
  toolchain file — see the Windows slice command below). Either layout works;
  runtime DLLs resolve from CMake imported targets, never hardcoded paths.
- **Linux (Debian/Ubuntu):** `sudo apt install build-essential cmake
  libopencv-dev libcurl4-openssl-dev libmbedtls-dev libx11-dev libxext-dev
  libxrandr-dev libglib2.0-dev libpipewire-0.3-dev libaubio-dev`

Native dependencies stay system packages (no vendored `.so` set); see the
`Aurora-b9q` bead for the decision.

## Slice builds (standalone)

Each app also configures on its own (`cmake -S app/linux -B build`);
standalone configures are dev-only and report version "dev".

- Linux (`app/linux`, needs `core/`, `input/linux`, `output/hue` alongside, or
  toggle `AURORA_APP_ENABLE_LINUX_INPUT` / `_HUE_OUTPUT` off):

  ```sh
  cmake -S . -B build
  cmake --build build
  ctest --test-dir build --output-on-failure

  AURORA_HUE_BRIDGE_ADDRESS=... AURORA_HUE_USERNAME=... AURORA_HUE_CLIENTKEY=... ./build/bin/Aurora
  ```

- Windows (`app/windows`, needs `core/`, `input/windows`, `output/hue`;
  Visual Studio + vcpkg for core's OpenCV dependency):

  ```powershell
  cmake -S . -B build -G "Visual Studio 17 2022" -A x64 -DCMAKE_TOOLCHAIN_FILE=<path-to-vcpkg>/scripts/buildsystems/vcpkg.cmake
  cmake --build build --config Release
  ctest --test-dir build -C Release --output-on-failure

  $env:AURORA_HUE_BRIDGE_ADDRESS = "..."; $env:AURORA_HUE_USERNAME = "..."; $env:AURORA_HUE_CLIENTKEY = "..."
  ./build/bin/Release/Aurora.exe
  ```

Running needs a Hue bridge with registered lamps and an entertainment area
defined through Philips' official app; without credentials in env, `hue`
just isn't registered as an output. Config roots: `$AURORA_CONFIG_DIR` or
`$HOME/.config/aurora` on Linux, `%AURORA_CONFIG_DIR%` or `%APPDATA%\Aurora`
on Windows. The app prints its URL in the terminal — Ctrl+click to open the
WebUI. (You must launch from a terminal so the process persists.)

## Install / portable trees

- **Linux:** `cmake --install build/linux-app --prefix <dir>` produces
  `bin/Aurora` (+ `lib/`, `doc/`, `share/applications/aurora.desktop`,
  hicolor icons). `$ORIGIN`-relative RPATH keeps `bin/` + `lib/`
  relocatable; system integration libs (X11/PipeWire/glib, system OpenCV)
  stay host prerequisites.
- **Windows:** the build copies OpenCV's runtime DLLs next to the exe
  automatically, and the WebUI is embedded as a fallback — the `bin/Release`
  folder is portable as-is. One prerequisite stays on you: the
  [Visual C++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
  (central deployment, serviced by Windows Update). It is deliberately not
  vendored — re-shipping the CRT means re-shipping every security update.

## Tests

`ctest --test-dir build/<preset>` runs the full native suite for that
preset. Slice `tests/` dirs link the slice lib (`AuroraApp`), not the
binary, and run under `ctest` wherever they land.

## Troubleshooting

**CMake too old, or the old one keeps getting picked up (Linux)**
- If the CMake in `PATH` is older than the pinned version, safest is a venv:
  `python3 -m venv ~/.venvs/build`, activate it, `pip install cmake`, and run
  configure from inside it — the venv's `bin` leads `PATH`, so its cmake is
  the one everything finds and the apt copy can never shadow it. A bare
  `pip install cmake` outside a venv works too, but `~/.local/bin` sorts
  after `/usr/bin/cmake` on some setups (and subshells may not inherit your
  `PATH` tweaks), so the old one can still win.

**I'm not seeing audio reacting**
- If no audio was actively playing before you toggled to audio the grabber
  might have trouble finding it. Switch back to video, play some audio, then
  try switching to audio.

**I double-clicked on the built app but not seeing anything**
- Currently you have to launch the app from a terminal window so its process
  can persist. That also tells you what link to open your browser to for
  the UI.
