# Steam Deck Game Mode: the gamescope node is reachable from a background service and from the Distrobox (paused before the light test)

Id: i0sz-game-mode-probes

`Aurora-i0sz` (open, P3, paused). Prechecks for running Aurora from the Arch Distrobox `aurora-dev` while the Deck is in Game Mode. Web research (gamescope node, `GAMESCOPE_WAYLAND_DISPLAY` inheritance, Distrobox PipeWire, Steam shortcut and Decky lifecycle) found no source showing an outside-the-session process capturing the node, so the probes were run on the Deck (SteamOS 3.9.5). Scripts are in `~/.cache/aurora-i0sz/` (not committed): `probe.sh`, `sampler.sh`, `aurora-watcher.sh`.

- Desktop Mode: no `~/.distroboxrc`, `PIPEWIRE_RUNTIME_DIR` unset (the Distrobox Deck guide's PulseAudio override is not active), `/run/user/1000/pipewire-0` reachable from the box, same graph as the host.
- `/run/user/1000/gamescope-environment` is rewritten at every Game Mode start and holds `GAMESCOPE_WAYLAND_DISPLAY=gamescope-0`, `DISPLAY` and the `STEAM_GAMESCOPE_*` variables.
- Non-Steam shortcut launch (`probe.sh`, game focused): the process inherited `GAMESCOPE_WAYLAND_DISPLAY=gamescope-0`, `DISPLAY=:1`, `XDG_SESSION_TYPE=x11` on host and in the box. Steam showed a spinner for the window-less script, and the owner stopped it at 20 to 27 s, so lifetime is unmeasured. `pw-dump` was corrupted by Steam's `LD_PRELOAD` `gameoverlayrenderer.so` errors on stderr, so the node was not seen in that run. A shortcut is a foreground "game" (Stop button, reaper, transient `app-*.service`), the wrong launcher for a background process.
- Transient `systemd-run --user` sampler, started in Desktop Mode, survived Desktop to Game Mode to Desktop (`user@1000` manager persists across the login-session switch; `Linger=no`). During Game Mode (17:22:28 to 17:23:45) PipeWire node 52 appeared: `gamescope`, `Video/Source`, state `suspended`, seen by the host service and by `distrobox enter aurora-dev`. It vanished on return to Desktop Mode, and id 52 was reused for an unrelated stream.
- The service had `GAMESCOPE_WAYLAND_DISPLAY` unset. `selectBackend` needs it set to pick `GamescopePipewire` (`SessionDispatch.cpp`), so a service launch exports it from the env file. No Aurora code change is needed for the light test.
- The container is stopped across mode switches; the first `distrobox enter` in Game Mode starts it (several seconds).

## Open
- Frames flowing from the node to Aurora, lights following the game, and audio in Game Mode: the light test is `aurora-watcher.sh` (waits for `gamescope-wl`, then runs `./Aurora` in the box with `GAMESCOPE_WAYLAND_DISPLAY` exported).
- Whether a second PipeWire consumer disturbs Steam Remote Play or recording (pipewire issue 3157).
- Decky is only needed for an in-Game-Mode panel if the light test passes.
- Not verified that a game was focused during the sampler window.

## Lessons
- A `systemd-run --user` service started in Desktop Mode survives the switch to Game Mode and can see the gamescope node, while a Steam non-Steam shortcut is a foreground app Steam stops and reaps (`input`).
