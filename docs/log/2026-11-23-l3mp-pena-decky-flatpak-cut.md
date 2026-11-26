# Decky plugin and Flatpak manifest cut from the SteamOS plan

Id: l3mp-pena-decky-flatpak-cut

`Aurora-l3mp` (Decky plugin) and `Aurora-pena` (Flatpak manifest) closed as cut, both P4 and parked at 1.2.2. Neither was built. The 1.2.1 route (scripted Arch Distrobox, Game Mode launcher unit, paired phone) is the supported SteamOS path.

- Decky: a paired phone already controls Aurora in Game Mode (verified 2026-11-22), so an in-game panel adds nothing the owner needs. It would also need a root-run plugin bundling a capture binary (Decky Store acceptance unknown) and an iframe of localhost in Steam's CEF panel (CSP and CORS unverified). The only store web view tried, Web Browser 1.4.3, crashes on Decky 3.x, so that question was never tested. Findings are in [[i0sz-game-mode-probes]].
- Flatpak: a sandboxed app cannot write the host `systemd --user` unit that starts Aurora in Game Mode without extra permissions (Flathub acceptance unknown), and a first-run "Enable Game Mode" step would still need host-side setup. It also needs a maintained manifest on a heavy runtime (OpenCV, aubio). Gamescope capture from inside the sandbox was never tested. The planned permissions (`--socket=x11` with `--share=ipc`, the portal talk-name, `--socket=pipewire`) are in [[future-steamos-support]].
- What Flatpak would buy: install from Discover with no terminal or Developer Mode, no source build on the Deck (CI publishes no Arch binary today), updates through Discover, and Linux desktops beyond the Deck. Revisit if non-developer installs are wanted.
- Not changed: the planning doc still lists both as candidates and `docs/SteamOS.md` is unaffected.

## Lessons
- none
