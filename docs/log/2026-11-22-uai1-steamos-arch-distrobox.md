# Aurora builds and captures on a Steam Deck in an Arch Distrobox (Desktop Mode)

Id: uai1-steamos-arch-distrobox

`Aurora-uai1`. On a Steam Deck (SteamOS 3.9.5, KDE Plasma Wayland, kernel 7.2.7-valve2) an Arch Distrobox `aurora-dev` (`docker.io/library/archlinux:latest`) builds Aurora 1.2.0, passes 204 of 204 tests, captures the screen through the xdg portal and replays the restore token. The owner then confirmed the real Hue lights connect and follow the NVIDIA GeForce capture source. Game Mode is not verified and moved to `Aurora-i0sz`. Setup is in `docs/Building.md` (Arch section); the verified-on lists are in `input/linux/README.md` and `docs/planning/FutureSteamOSSupport.md`.

- Box: `distrobox create --name aurora-dev --image docker.io/library/archlinux:latest`. Host had distrobox 1.8.2.5, podman 6.0.2 (rootless, overlay, crun), subuid ranges set. Host root had 837 MB free; container storage is under `/home`.
- Packages that resolved: `base-devel cmake ninja git pkgconf nodejs npm opencv curl libx11 libxext libxrandr libxdamage libxrender glib2 libpipewire pipewire aubio libsecret mbedtls3` (cmake 4.5.1, nodejs 26.13.1, npm 12.2.3, opencv 5.1.0, libpipewire 1.6.11, aubio 0.4.9 with its `.pc`, mbedtls3 3.6.7).
- Build: `cmake --preset linux-app -G Ninja` with `PKG_CONFIG_PATH=/usr/lib/mbedtls3/pkgconfig`, 250 steps, `-j6`.
- The bead's risks: mbedtls (resolved, `mbedtls3`; `mbedtls2` no longer exists), aubio `.pc` (present), PipeWire from a container (works: host PipeWire 1.6.8 behind the PulseAudio shim, `pactl` and `paplay` in the box reach it), Node >= 22.12 (26.13.1).
- Capture test: `tools/light-viz-relay/devstack.py up --input live` (fake Hue bridge, relay, isolated config root `/tmp/aurora-fresh`). The portal picker appeared once per fresh run; state `running`, `builtin.video` on input `linux`, no errors, zones non-zero. `devstack.py restart` on the same config root reached `running` in about 1.5 s and the owner saw no second picker with sharing still active, so the restore token replays. `Aurora-w6no` was already closed and its text is stale.
- Audio: `builtin.audio` runs with `source.audio` bound to the host speaker sink. A 3 s 440 Hz tone through `paplay` gave only the continuous hue drift in the relay SSE; a response to sound is not demonstrated.
- Launcher: `distrobox-export --app` of a hand-made `.desktop` file gives "Aurora (on aurora-dev)" in the KDE menu (`~/.local/share/applications/aurora-dev-aurora.desktop`). It points at `build/linux-app/bin/Aurora`, so cleaning the build breaks it. The build's own `aurora.desktop` has `Exec=/usr/local/bin/Aurora` and cannot be exported as is. The launcher itself was not launched by Claude.
- Beads tool: `bd` 1.3.4 installed to `~/.local/bin` from the release tarball (sha256 checked). `.beads` had no Dolt database here, so `bd bootstrap --yes` imported the 819 issues from `issues.jsonl`. `~/.local/bin` is not on the host PATH.

## Dead ends and surprises
- The graph editor depended on `@weblings/grille` as a GitHub release tarball. npm 12 refused it (`EALLOWREMOTE`). `npm ci --allow-remote=all` installed it, but CMake's own `npm ci` step still failed, and touching the Ninja stamp did not help. Fixed at the source: Grille is published as `@weblings_things/grille` 0.2.1 on npm (commit `e495195d`: 25 imports, lockfile, two READMEs). Plain `npm ci`, `tsc --noEmit` and `vite build` pass. `npm test` and `npm audit` (3 vulnerabilities: 2 moderate, 1 high) were not run or looked at, and CI workflows were not checked for the old tarball URL.
- Aurora segfaulted two seconds after the first portal approval. Cause pinned by experiment, not a backtrace: the `pipewire` package was missing, so `client.conf` could not load. Installing it fixed the run. Why a missing config crashes instead of reporting an error is not investigated; tracked as `Aurora-j0w4`.
- Three background build notices said "exit code 0" over a failed ninja build, and one `pkill -f` killed its own wrapper. A first tone test never played because the file sat in the Flatpak's private `/tmp`.
- The shell Claude used ran inside the VS Code Flatpak, so host work went through `flatpak-spawn --host`.

## Open
- `Aurora-vijc` (P2): color updates reach the lights only about every 1 to 2 s on this setup, not specific to the NVIDIA source. Not measured.
- `Aurora-j0w4` (P2): Aurora segfaults when PipeWire cannot load `client.conf`.
- `Aurora-i0sz`: Game Mode capture and audio, and whether the audio effect reacts to sound.
- `Aurora-pena` (Flatpak manifest) and `Aurora-l3mp` (Decky plugin), both P4.
- Not tested: a real Hue bridge with the Grille/editor flow, X11 session, the exported launcher.

## Lessons
- Arch ships Mbed TLS 4.x as `mbedtls`, so build against `mbedtls3` with a `PKG_CONFIG_PATH` (`build-toolchain`).
- npm 12 refuses URL tarball dependencies by default (`EALLOWREMOTE`) (`build-toolchain`).
- Touching a custom command's stamp file does not stop Ninja from rerunning it (`build-toolchain`).
- An agent in the VS Code Flatpak reaches the host through `flatpak-spawn --host`, and `/tmp` is not shared (`build-toolchain`).
- Arch's `libpipewire` has no `client.conf`, and Aurora segfaulted two seconds after the portal picker was approved (`input`).
- A background build wrapper reports exit 0 when its own last command succeeds, so read the log's EXIT and FAILED lines (`debugging-method`).
- `pkill -f <pattern>` inside a wrapper shell can match its own command line (`debugging-method`).
- A bead or doc saying a bug is open can be stale, so check the bead status and the source first (`debugging-method`).

## Beads filed after the close
- `Aurora-vijc` (P2 bug, `linux`, `steamos`): slow color cadence, filed first as a general Linux problem and rescoped the same day to this Deck plus Arch Distrobox setup, because the owner has had decent framerate on other Linux devices. Candidates: Deck CPU load with a GeForce stream running, the container capture path and DMA-BUF negotiation, build type, the container itself. Control: the same build on a known-good device.
- `Aurora-j0w4` (P2 bug, `linux`, `steamos`): the SIGSEGV when PipeWire's `client.conf` is missing. Needs a backtrace and a capture error in `/api/v1/state` instead of a crash.
- Both are `discovered-from` `Aurora-uai1`, alongside `Aurora-i0sz`, `Aurora-pena` and `Aurora-l3mp` filed before the close.
