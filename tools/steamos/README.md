# SteamOS tools

Game Mode launcher for the Arch Distrobox install route: a `systemd --user` unit that starts Aurora when gamescope starts and stops it when gamescope exits.

- `setup-aurora.sh`: one-shot setup in Desktop Mode (box, packages, build, unit, menu entry), rerunnable. Guide: [[steamos-user-guide]].
- `aurora-gamemode.sh`: the loop (wait for `gamescope-wl`, export `GAMESCOPE_WAYLAND_DISPLAY` from `/run/user/<uid>/gamescope-environment`, evict a stale Aurora, run Aurora in the box). Overrides in `~/.config/aurora/gamemode.env`: `AURORA_BIN_DIR`, `AURORA_BOX`.
- `aurora-gamemode.service`: the unit.
- `install-gamemode-unit.sh`: installs and enables both on the host (Desktop Mode, safe to rerun). Log: `journalctl --user -u aurora-gamemode`.

See [[mjk0-game-mode-launcher]] and [[future-steamos-support]].
