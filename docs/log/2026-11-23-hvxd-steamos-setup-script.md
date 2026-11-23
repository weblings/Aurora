# SteamOS setup script and user guide (Distrobox + Game Mode, 0 to 1)

Id: hvxd-steamos-setup-script

`Aurora-hvxd` (closed, P2; 1.2.1). `tools/steamos/setup-aurora.sh` runs on the Deck host in Desktop Mode from a checkout under `$HOME` and does five steps: create the `aurora-dev` Arch Distrobox (skipped if present), `pacman -Syu --needed` the package list of docs/Building.md, `cmake --preset linux-app -G Ninja` with `PKG_CONFIG_PATH=/usr/lib/mbedtls3/pkgconfig` and a build, install the launcher unit via `install-gamemode-unit.sh` ([[mjk0-game-mode-launcher]]), write `~/.local/share/applications/aurora.desktop`. Rerunnable; a rerun after `git pull` is an incremental build. Overrides: `AURORA_BOX`, `AURORA_JOBS`, `AURORA_SKIP_UNIT`, `AURORA_SKIP_MENU`. A non-default box or checkout path is written to `~/.config/aurora/gamemode.env` for the unit.

- User guide: [[steamos-user-guide]] (`docs/SteamOS.md`), six steps, pairs the phone through `steamdeck.local` (Aurora-dl5b). docs/Building.md, [[future-steamos-support]], `input/linux/README.md` and `tools/steamos/README.md` point at it.
- CI question: `linux.yml` builds and tests on Ubuntu only and publishes no binary; its Mbed TLS, OpenCV and aubio versions differ from Arch. Decision: build on the Deck, no prebuilt Arch artifact for 1.2.1.
- Menu entry: a plain `.desktop` file whose `Exec` does `cd` to the build `bin` dir then `./Aurora` in the box, not a `distrobox-export`. Distrobox adds its own two entries (`Aurora-dev`, a shell; `Aurora (on aurora-dev)`, an export of the binary); the script does not touch them. Icon is `Logo_Square_Light_512.png`: the `Dark` logo is dark-coloured and vanishes on a dark KDE theme. KDE has no hook to swap a menu icon with the colour scheme.
- Verified on the Deck (SteamOS 3.9.5): a fresh `aurora-clean` box from nothing through steps 1-3 (250 of 250 build steps, exit 0, box removed after); a rerun on `aurora-dev` completed steps 1-5 (incremental build, unit active, `.desktop` written); owner switched to Game Mode and the newly built Aurora worked. Not redone on a fresh box: unit and menu steps, and phone pairing (both verified earlier under Aurora-mjk0 and Aurora-dl5b).

## Lessons
- none
