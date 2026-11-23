# Steam Deck Game Mode: the gamescope node is reachable from a background service and from the Distrobox (lights follow the game; audio untested)

Id: i0sz-game-mode-probes

`Aurora-i0sz` (closed, P3; the light test passed, audio and the permanent launcher moved to follow-up beads). Prechecks for running Aurora from the Arch Distrobox `aurora-dev` while the Deck is in Game Mode. Web research (gamescope node, `GAMESCOPE_WAYLAND_DISPLAY` inheritance, Distrobox PipeWire, Steam shortcut and Decky lifecycle) found no source showing an outside-the-session process capturing the node, so the probes were run on the Deck (SteamOS 3.9.5). Scripts are in `~/.cache/aurora-i0sz/` (not committed): `probe.sh`, `sampler.sh`, `aurora-watcher.sh`.

- Desktop Mode: no `~/.distroboxrc`, `PIPEWIRE_RUNTIME_DIR` unset (the Distrobox Deck guide's PulseAudio override is not active), `/run/user/1000/pipewire-0` reachable from the box, same graph as the host.
- `/run/user/1000/gamescope-environment` is rewritten at every Game Mode start and holds `GAMESCOPE_WAYLAND_DISPLAY=gamescope-0`, `DISPLAY` and the `STEAM_GAMESCOPE_*` variables.
- Non-Steam shortcut launch (`probe.sh`, game focused): the process inherited `GAMESCOPE_WAYLAND_DISPLAY=gamescope-0`, `DISPLAY=:1`, `XDG_SESSION_TYPE=x11` on host and in the box. Steam showed a spinner for the window-less script, and the owner stopped it at 20 to 27 s, so lifetime is unmeasured. `pw-dump` was corrupted by Steam's `LD_PRELOAD` `gameoverlayrenderer.so` errors on stderr, so the node was not seen in that run. A shortcut is a foreground "game" (Stop button, reaper, transient `app-*.service`), the wrong launcher for a background process.
- Transient `systemd-run --user` sampler, started in Desktop Mode, survived Desktop to Game Mode to Desktop (`user@1000` manager persists across the login-session switch; `Linger=no`). During Game Mode (17:22:28 to 17:23:45) PipeWire node 52 appeared: `gamescope`, `Video/Source`, state `suspended`, seen by the host service and by `distrobox enter aurora-dev`. It vanished on return to Desktop Mode, and id 52 was reused for an unrelated stream.
- The service had `GAMESCOPE_WAYLAND_DISPLAY` unset. `selectBackend` needs it set to pick `GamescopePipewire` (`SessionDispatch.cpp`), so a service launch exports it from the env file. No Aurora code change is needed for the light test.
- The container is stopped across mode switches; the first `distrobox enter` in Game Mode starts it (several seconds).

## Light test (passed)
`aurora-watcher.sh` (a `systemd-run --user` service started in Desktop Mode) waited for `gamescope-wl`, read `gamescope-0` from the env file and ran `./Aurora` in `aurora-dev` with `GAMESCOPE_WAYLAND_DISPLAY` exported. The owner switched to Game Mode and the real Hue lights followed the screen, including during the boot video before the Steam UI finished loading. Log: gamescope up 17:28:14, `input='linux', 1 output(s)`, capture and graph init 34 ms, outputs init 609 ms, LINEAR DMA-BUF negotiated in Game Mode, gamescope gone 17:29:23 and the watcher stopped Aurora cleanly. The run was about 70 s; steady-state frame rate and whether `SlowReadWatch` fell back were not measured.

## Filed after the close
- `Aurora-mjk0` (P3): permanent Game Mode launcher, a persistent `systemd --user` unit replacing the throwaway watcher (no browser window over the game, install steps, where it ships).
- `Aurora-ch0g` (P3): audio capture and audio-effect reaction in Game Mode, a 2-minute frame-rate and `SlowReadWatch` check, and Remote Play interference.
- The watcher service was stopped after the test. `Aurora-l3mp` (Decky) stays P4.

## Open (now tracked in those beads)
- Whether a second PipeWire consumer disturbs Steam Remote Play or recording (pipewire issue 3157).
- Audio capture in Game Mode and whether the audio effect reacts to sound.
- A permanent launcher (a persistent user unit that starts at boot, instead of the test script) and where it would ship.
- Decky is only needed for an in-Game-Mode panel if the light test passes.
- Not verified that a game was focused during the sampler window.

## Lessons
- A `systemd-run --user` service started in Desktop Mode survives the switch to Game Mode and can see the gamescope node, while a Steam non-Steam shortcut is a foreground app Steam stops and reaps (`input`).
