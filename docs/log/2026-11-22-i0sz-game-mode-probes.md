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

## Audio test (Aurora-ch0g, passed)
`aurora-audio-watcher.sh`: same launch as the light test, then, once `:8215` answered, `PATCH /api/v1/state {"effect":"builtin.audio"}` and a restore of the previous effect when gamescope exited. Run 17:52:54 to 17:55:34 (2 min 40 s) in Game Mode with a game playing sound: the owner saw the lights move with the audio ("Music pulse"). The log agrees: state `effect: builtin.audio`, `source.audio.sink` the Deck speaker sink (`auto: true`, input `linux-audio`), and a PipeWire link `alsa_output...Speaker__sink -> AuroraAudioStream` in state `active` in every sample (12 samples, 15 s apart). The graph reports `graphInputs {audio: true, video: false}`, so no video capture ran in this test, and the DMA-BUF rate and `SlowReadWatch` question is still open.
- The restore PATCH ran after gamescope had exited, so its reply showed `effect: null` with a screen-capture error; `config.json` was written correctly (`activeEffectId = builtin.video`).
- Side effect: the first PATCH to `builtin.audio` also set `activeAudioInputName = "linux-audio"` in `~/.config/aurora/config.json` (state showed `configuredInputs.audio: null` before). It stays set after the restore.

## Control and install route (Aurora-wsyo, Aurora-lnjl, closed)
- No built-in browser exists in Game Mode (the Steam overlay browser and pinned windows are PC features; a browser is added as a non-Steam app and switched to full screen, so it is not an in-game overlay). Steam's Chrome shortcut is a fallback only.
- Decky on the Deck was v3.1.6 (Dec 2024) with the loader healthy but an empty plugin list. Updated to v3.3.1 with `sudo sh install_release.sh`; plain `sh install_release.sh` fails because the script runs `exec sudo "$0"` with a bare name. `~/homebrew/plugins` is root-owned. An agent attempt to read Decky's local `/auth/token` endpoint was blocked and not retried.
- The store plugin Web Browser 1.4.3 installed but its backend crashes on Decky 3.x (`ModuleNotFoundError: No module named 'injector'`, `main.py` line 9), so the sidebar spinner never ends. This says nothing about iframing localhost in a Decky panel.
- LAN pairing is shipped (`Aurora-5ipy.5` backend, `Aurora-5ipy.6` pairing screen, closed 2026-10-16); the line "no auth" in [[external-control]] is an older planning note. The owner paired a phone in Desktop Mode (the trusted local UI at `127.0.0.1:8215`) and then controlled the Game Mode Aurora from it. Tokens live in `~/.config/aurora`, so pairing carries across modes. The Deck's `public` firewall zone allows TCP 1024 to 65535, so 8215 needed no change; the Deck was at `192.168.0.172` on `wlan0`.
- A copy of Aurora left running from Desktop Mode holds `~/.config/aurora/aurora.lock` and uses portal capture; a Game Mode launch would hit "already running". Whether it survives the mode switch is unverified (the process sits in the `aurora-dev` podman scope under `user@1000.service`).
- Decision for 1.2.1: scripted Arch Distrobox, launcher unit, paired phone. Flatpak and Decky move to 1.2.2.

## Filed after the close
- `Aurora-hvxd` (P2, 1.2.1): setup script and user guide for the whole path, `Aurora-dl5b` (P3, 1.2.1): stable phone address. `Aurora-mjk0` (P3, 1.2.1): permanent Game Mode launcher, a persistent `systemd --user` unit replacing the throwaway watcher (no browser window over the game, install steps, where it ships).
- `Aurora-ch0g` (P3, closed the same day): audio capture and audio-effect reaction in Game Mode (passed). Its 2-minute video frame-rate and `SlowReadWatch` check and the Remote Play interference check were skipped by the owner and not done.
- The watcher service was stopped after the test. `Aurora-l3mp` (Decky) stays P4.

## Open
- Not checked (skipped): Game Mode video frame rate and the `SlowReadWatch` fallback over a long run, and whether a second PipeWire consumer disturbs Steam Remote Play or recording (pipewire issue 3157).
- The permanent launcher unit with a stale-instance eviction: `Aurora-mjk0`; the setup script and guide: `Aurora-hvxd`.
- A native Decky panel for Deck-only control (`Aurora-l3mp`) and the Flatpak (`Aurora-pena`) are 1.2.2.
- Not verified that a game was focused during the sampler window.

## Lessons
- A paired phone controls the Game Mode Aurora and a store Decky plugin can crash on a newer loader (`build-toolchain`, `architecture-process`).
- A `systemd-run --user` service started in Desktop Mode survives the switch to Game Mode and can see the gamescope node, while a Steam non-Steam shortcut is a foreground app Steam stops and reaps (`input`).
