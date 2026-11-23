# SteamOS Game Mode launcher unit: Aurora starts with gamescope and stops with it (Distrobox route)

Id: mjk0-game-mode-launcher

`Aurora-mjk0` (closed, P3; lifecycle only). Files in `tools/steamos/`: `aurora-gamemode.sh` (loop), `aurora-gamemode.service` (`systemd --user`, `WantedBy=default.target`, `Restart=on-failure`), `install-gamemode-unit.sh` (copies to `~/.local/share/aurora/` and `~/.config/systemd/user/`, enables, restarts). Optional overrides in `~/.config/aurora/gamemode.env`: `AURORA_BIN_DIR`, `AURORA_BOX`. Evolved from the throwaway watcher of [[i0sz-game-mode-probes]].

- Loop: wait for `gamescope-wl`, sleep 8 s, read `GAMESCOPE_WAYLAND_DISPLAY` from `/run/user/<uid>/gamescope-environment` (retry if empty), stop any running Aurora, run `distrobox enter aurora-dev -- env GAMESCOPE_WAYLAND_DISPLAY=... XDG_SESSION_TYPE=x11 ./Aurora`, and stop Aurora when gamescope exits. 5 s pause before a relaunch if Aurora exits while gamescope is up.
- Stale-copy eviction: `pkill -x Aurora`, then SIGKILL after 10 s, before every start. Whether a Desktop Mode copy survives the mode switch was not tested; the eviction covers both outcomes.
- The unit's cgroup does not contain Aurora (it lives in the `aurora-dev` podman scope), so stopping the unit relies on the script's `TERM` trap calling `pkill -x Aurora`, not on `KillMode`.
- Browser: Game Mode has no browser, so the `xdg-open` on start is harmless there; no Aurora change was made (an `AURORA_DEV_NO_BROWSER` skip was tried and reverted).
- Verified on the Deck (SteamOS 3.9.5): (1) Desktop to Game Mode to Desktop: started at gamescope up (19:00:10), real lights followed the game, stopped cleanly 1 s after gamescope exited (19:00:55). (2) Cold boot straight into Game Mode: Aurora started with no manual step and the lights followed the game (owner-confirmed).
- journald also receives the Distrobox's `set -x` setup noise and podman event lines; harmless.
- Not done: docs for the end-user install guide (`Aurora-hvxd`).

## Filed after the close
- Game Mode run toggle (config flag the script reads, Dashboard control shown only when the unit is installed) and a general Settings tab: Aurora-xg8z (toggle) and Aurora-vxhm (Settings tab).

## Lessons
- A `systemd --user` unit does not own a process started through `distrobox enter`, so stop it by name from a trap (`input`).
