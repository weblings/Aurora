# Building Aurora from source

End users: start at the root [README Quick Start](../README.md#quick-start)
(prebuilt release zips). This page is the full from-source reference for
contributors, packagers, and unsupported platforms.

## Presets (full-app builds)

| Preset | Binary | Layout |
|---|---|---|
| `linux-app` | `build/linux-app/bin/Aurora` | single-config |
| `windows-app` | `build/windows-app/bin/Release/Aurora.exe` | multi-config (`bin/<Config>`) |
| `mac-app` | `build/mac-app/bin/Aurora.app` | single-config (experimental, tier 1) |

```sh
cmake --preset linux-app -DCMAKE_INSTALL_PREFIX=~/.local  # or windows-app
cmake --preset mac-app  # experimental tier 1: no install step, run Aurora.app from the build tree
cmake --build build/linux-app   # --config Release on Windows
ctest --test-dir build/linux-app --output-on-failure
cmake --install build/linux-app # registers launcher + tray icon (Linux)
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
  The `windows-app` preset also needs curl, Mbed TLS, aubio and miniaudio, so
  vcpkg is the practical route. Bare-machine recipe, verified end to end
  (configure, build, 70/70 tests) on a fresh Windows 11 laptop, 2026-09-28
  (the four `winget` lines and `vcpkg install` are all one-time setup):

  ```powershell
  winget install --id Kitware.CMake -e --source winget
  winget install --id Python.Python.3.12 -e --source winget --scope user   # only for tools/ dev scripts
  winget install --id Microsoft.VisualStudio.2022.BuildTools -e --source winget --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  git clone --depth 1 https://github.com/microsoft/vcpkg C:\vcpkg; C:\vcpkg\bootstrap-vcpkg.bat -disableMetrics
  C:\vcpkg\vcpkg install opencv4:x64-windows curl:x64-windows mbedtls:x64-windows "aubio[core]:x64-windows" miniaudio:x64-windows

  cmake --preset windows-app -DCMAKE_TOOLCHAIN_FILE=C:/vcpkg/scripts/buildsystems/vcpkg.cmake
  cmake --build build/windows-app --config Release
  ```

  Core's own suite on Windows (`cmake -S core -B <dir> -G "Visual Studio 17 2022" -A x64
  -DCMAKE_TOOLCHAIN_FILE=... -DAubio_DIR=C:/vcpkg/installed/x64-windows/share/aubio`)
  needs `Aubio_DIR` passed explicitly -- without it `find_package(Aubio CONFIG)`
  fails standalone (the full-app preset resolves it on its own). 70/70 there too.

  Budget time: `opencv4` with default features took ~40 min (it also builds
  dnn/gapi/calib3d, none of which Aurora uses); everything else is minutes.
  `--source winget` is required, and open a new shell (or reload `Path`)
  after the installs -- see the `winget install fails with exit 94` lesson.
- **Linux (Debian/Ubuntu):** `sudo apt install build-essential cmake
  libopencv-dev libcurl4-openssl-dev libmbedtls-dev libx11-dev libxext-dev
  libxrandr-dev libglib2.0-dev libpipewire-0.3-dev libaubio-dev
  libsecret-1-dev`. Without `libsecret-1-dev`, configure warns and core's
  `AuroraSecrets` builds a stub that reports every secret store as
  unavailable (`-DAURORA_SECRETS_ENABLE_LIBSECRET=OFF` silences the warning).
- **macOS (Apple Silicon, experimental):** Xcode CLT + Homebrew — full setup
  (packages, `mbedtls@3` pin, `mac-app` preset) lives in
  [CONTRIBUTING.md](../CONTRIBUTING.md#platform-notes).

Native dependencies stay system packages (no vendored `.so` set); see the
`Aurora-b9q` bead for the decision.

### Graph editor (optional, Node)

The node-graph editor (`web/graph-editor/`, Vite + React + TypeScript) is
opt-in: `-DAURORA_ENABLE_GRAPH_EDITOR=ON` on any app preset or slice
configure. With it OFF (the default) no Node is needed and the embedded
webroot is unchanged. With it ON the build runs `npm ci` and `npm run build`
(Vite writes the bundle to the build dir, never under `web/ui/`), embeds the
result, and the app serves it at `/graph-editor/`.

- **Prerequisite:** Node >= 22.12 with npm (`engines` in `package.json`;
  `.npmrc` enforces it). macOS: `brew install node@22`. Linux: your
  distro's `nodejs`/`npm` if new enough, else nodejs.org or a version
  manager. Windows: `winget install OpenJS.NodeJS.LTS`. CMake finds
  `npm.cmd`/`npm` on `PATH` and stops with a pointer here when the option
  is ON and it is missing.
- **Install scripts are off** (`ignore-scripts=true` in `.npmrc`), and the
  committed `package-lock.json` pins every platform's native Vite parts, so
  one lockfile serves all three OSes.
- **Offline / no-Node builds:** build the bundle elsewhere and pass
  `-DAURORA_GRAPH_EDITOR_DIST=<dir>`; npm is then skipped entirely. Plain
  `npm ci` also honours `npm_config_*` environment variables (offline
  cache, proxy).
- **Editor dev loop:** with an Aurora running, `cd web/graph-editor &&
  AURORA_PORT=<port> npm run dev` gives hot reload and proxies `/api` to it.
- **Third-party notices:** Vite writes the THIRD-PARTY-NOTICES file for the
  bundled npm packages. It is served inside the editor's map, installed
  next to the Linux copyright file, and copied into
  `Aurora.app/Contents/Resources/Licenses/graph-editor/` on macOS.

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

- Mac (`app/mac`, needs `core/`, `input/mac`, `output/hue` alongside, or
  toggle `AURORA_APP_ENABLE_MAC_INPUT` / `_HUE_OUTPUT` off):

  ```sh
  cmake -S . -B build
  cmake --build build
  ctest --test-dir build --output-on-failure
  ```

Running needs a Hue bridge with registered lamps and an entertainment area
defined through Philips' official app; without credentials in env, `hue`
just isn't registered as an output. Config roots: `$AURORA_CONFIG_DIR` or
`$HOME/.config/aurora` on Linux, `%AURORA_CONFIG_DIR%` or `%APPDATA%\Aurora`
on Windows. The app prints its URL in the terminal — Ctrl+click to open the
WebUI. (You must launch from a terminal so the process persists.)

## Install / portable trees

- **Linux:** `cmake --install build/linux-app` produces
  `bin/Aurora` (+ `lib/`, `doc/`, `share/applications/aurora.desktop`,
  hicolor icons). `$ORIGIN`-relative RPATH keeps `bin/` + `lib/`
  relocatable; system integration libs (X11/PipeWire/glib, system OpenCV)
  stay host prerequisites. Choose the prefix at configure time
  (`cmake --preset linux-app -DCMAKE_INSTALL_PREFIX=~/.local`): the
  installed `aurora.desktop` bakes that bindir into its absolute `Exec=`
  line, so the launcher entry works whether or not Aurora is on `PATH`.
  The install also refreshes the icon cache and desktop database itself
  (best-effort; skipped under `DESTDIR`, where the packager's postinst
  owns those steps) -- no manual `gtk-update-icon-cache` or
  `update-desktop-database` needed. The tray icon then resolves on any
  desktop with a tray host (KDE, Ubuntu-GNOME with extension); stock
  GNOME has none by design.

### Start at login (Linux)

Copy the installed `aurora.desktop` into `~/.config/autostart/` (create the
dir if needed) -- that file *is* the autostart entry, no separate one ships,
and nothing is ever installed system-wide into `/etc/xdg/autostart`. Its
`Exec=` is already absolute, so no editing is needed even when Aurora is
not on `PATH`. This is intentionally
plain XDG autostart, not the `org.freedesktop.portal.Background` portal:
the portal is the sanctioned path for *sandboxed* (Flatpak) apps and is
unreliable outside a sandbox -- our native tarball gets nothing from it.
- **Windows:** the build copies OpenCV's runtime DLLs next to the exe
  automatically, and the WebUI is embedded as a fallback — the `bin/Release`
  folder is portable as-is. One prerequisite stays on you: the
  [Visual C++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
  (central deployment, serviced by Windows Update). It is deliberately not
  vendored — re-shipping the CRT means re-shipping every security update.
- **Mac:** no `cmake --install` support yet (single-machine builds only) —
  run `open build/mac-app/bin/Aurora.app` from the build tree. The release
  zip is a separate manual step: `tools/mac/sign-notarize.sh` (Developer ID,
  notarize, staple; see [[mac-notarization]]). The `.app`
  bundle exists so Aurora holds its own Screen Recording grant instead of
  Terminal's; grant what it requests, then quit and relaunch.

## Tests

`ctest --test-dir build/<preset>` runs the full native suite for that
preset. Slice `tests/` dirs link the slice lib (`AuroraApp`), not the
binary, and run under `ctest` wherever they land.

`AuroraSecretsTests "[real]"` (core standalone build) round-trips through
the real OS keyring under a throwaway scope. It's hidden from `ctest`
because it writes to the user's keyring, and it skips where no store is
usable.

Keychain access across a rebuild (Mac) needs two binaries, so it's a
three-step pair with a fixed entry (`acl-check/probe`). Keep the executable's
**file name** the same for both (`AuroraSecretsTests`): copies named `A`/`B`
make a delete fail with -25244 for a reason a real rebuild never hits. Use
`rm` then `cp` to swap binaries, not `cp` over the old file.

1. `AuroraSecretsTests "[real-write]"` leaves the entry.
2. Rebuild so the bytes differ (an unused static is dead-stripped and leaves
   the binary identical; add an `extern const char` instead), then run
   `AuroraSecretsTests "[real-read]"`.
   - Ad-hoc build (default): expect a dialog asking for the login keychain
     password (your Mac account password). **Always Allow** adds this build
     to the item's ACL (silent until the next rebuild); plain Allow leaves
     it unchanged; Deny → `Unavailable`. `Error` is a mapping gap and fails.
   - Identity-signed build (sign with `codesign -i <fixed id> -s "<identity>"`;
     the first run asks for the signing key, choose Always Allow once): expect
     no prompt, and a read of about 0.3 s. About 10 s means a dialog waited.
3. `AuroraSecretsTests "[real-cleanup]"` removes the entry and prints the
   delete error if there is one.

To see what a dialog changed, dump the item's ACL, filtered to the one
service so nothing else is shown (attributes only, no secret): see the
lesson "A legacy Keychain item's ACL can be dumped without reading the
secret".

On Linux and Windows the read is simply `Ok`; access isn't tied to the
binary there.

## Troubleshooting

**CMake too old, or the old one keeps getting picked up (Linux)**
- If the CMake in `PATH` is older than the pinned version, safest is a venv:
  `python3 -m venv ~/.venvs/build`, activate it, `pip install cmake`, and run
  configure from inside it — the venv's `bin` leads `PATH`, so its cmake is
  the one everything finds and the apt copy can never shadow it. A bare
  `pip install cmake` outside a venv works too, but `~/.local/bin` sorts
  after `/usr/bin/cmake` on some setups (and subshells may not inherit your
  `PATH` tweaks), so the old one can still win.

**A long-lived Windows build dir crashes or fails after `core/vcpkg.json` changed**
- Symptom: `Monitors and reload routes answer from PipelineHost` segfaults,
  or `Cannot open include file: 'brotli/decode.h'`, while a fresh tree of the
  same commit passes. The old dir's CMake cache and objects still point at
  the previous `vcpkg_installed`. Fastest fix: delete the build dir and
  reconfigure (pass `-DAubio_DIR=...` as above). To keep it:
  `cmake -U "Brotli_*" -U "*BROTLI*" -S core -B <dir>`, then a full build.
  Details: docs/lessons "Removing a dep from the vcpkg manifest doesn't clean
  an existing build dir" (build-toolchain). CI is unaffected (fresh tree,
  manifest mode off).

**I'm not seeing audio reacting**
- If no audio was actively playing before you toggled to audio the grabber
  might have trouble finding it. Switch back to video, play some audio, then
  try switching to audio.

**I double-clicked on the built app but not seeing anything**
- Currently you have to launch the app from a terminal window so its process
  can persist. That also tells you what link to open your browser to for
  the UI.
