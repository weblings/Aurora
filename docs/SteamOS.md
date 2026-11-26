# Aurora on the Steam Deck

Id: steamos-user-guide

Status: shipped for 1.2.1 (Distrobox route). Flatpak and Decky are 1.2.2, see [[future-steamos-support]].

Aurora runs on SteamOS in an Arch Distrobox (SteamOS's own root is read-only and wiped by updates). One script builds the box; a small service starts Aurora in Game Mode; you control it from your phone. About 40 minutes the first time, mostly the build.

## Set up

1. **Run the script in Desktop Mode.** Clone or unpack Aurora somewhere under your home folder (for example `~/Documents/Aurora`), open Konsole there and run:
   ```
   bash tools/steamos/setup-aurora.sh
   ```
   It creates the `aurora-dev` box, installs the packages, builds Aurora, installs the Game Mode service and adds an **Aurora** entry to the application menu. It needs internet and no password. Run it again any time: after `git pull` it rebuilds, otherwise it only checks.
2. **Launch Aurora once from the menu.** Set up your Hue bridge, choose the capture source in the screen-share picker (approve it once; Aurora remembers) and pick an effect.
3. **Pair your phone.** On the phone, on the same Wi-Fi, open `http://steamdeck.local:8215/`. Aurora shows a pairing request in its local window at `http://127.0.0.1:8215/` on the Deck; approve it there. Pairing needs the local window, so do it in Desktop Mode. The pairing is stored in `~/.config/aurora` and carries into Game Mode.
4. **Quit Aurora** (tray icon, Quit) before you switch. The service also stops a leftover copy, but quitting first is cleaner.
5. **Switch to Game Mode.** Aurora starts by itself when Game Mode starts and stops when it ends. Nothing to launch.
6. **Control from the phone** at `http://steamdeck.local:8215/`.

## Limits

- The phone and the Deck must be on the same Wi-Fi. The phone must resolve `.local` names (works on current iOS and most Android versions). If it does not, use the Deck's IP address and give the Deck a fixed address in your router (a DHCP reservation); a phone paired through an IP address pairs again if the IP changes.
- `steamdeck.local` is the Deck's hostname. If you renamed the Deck, use `http://<new-name>.local:8215/` and pair again.
- Pair through the same address you will use later: the pairing is tied to the host name the phone used.
- Aurora must be built on the Deck. The CI Linux build is for Ubuntu and is not published; its libraries (Mbed TLS, OpenCV, aubio) differ from Arch's, so it does not run in the box.

## Troubleshooting

- No lights in Game Mode: `journalctl --user -u aurora-gamemode` shows the service log.
- Service files and options: `tools/steamos/README.md`.
- Remove everything: `systemctl --user disable --now aurora-gamemode`, `distrobox rm aurora-dev`, delete `~/.config/systemd/user/aurora-gamemode.service` and `~/.local/share/applications/aurora.desktop`.
