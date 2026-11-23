# Settings accordion and the Launch Automatically in Game Mode toggle

Id: xg8z-game-mode-autostart-setting

`Aurora-xg8z` (closed, P3; 1.2.1) and `Aurora-vxhm` (closed, P4). The Dashboard gets a last accordion, Settings (`web/ui/SettingsPanel.js`), seeded with one row, Launch Automatically in Game Mode. Each edit saves at once through `PUT /api/config`; a refused save reverts the switch and shows an error line. Reachable from a paired phone like the rest of the Dashboard.

- Flag: `gameModeAutostart` in `config.json` (default true, `NoEffect` in `ConfigApply`, so no reload). The app never acts on it; `tools/steamos/aurora-gamemode.sh` greps `~/.config/aurora/config.json` (or `$AURORA_CONFIG_DIR`) before each start. False: the launcher logs, leaves Aurora stopped (does not evict a Desktop Mode copy) and idles until gamescope exits. A flip to on applies at the next Game Mode start, and the row says so. The unit stays enabled; the flag is the switch, so Aurora needs no host `systemctl`.
- Visibility: `/api/capabilities` gains `gameModeLauncher`, true when `~/.config/systemd/user/aurora-gamemode.service` exists (Linux app only; home is shared with the Distrobox). Deliberately not in `/api/v1/capabilities`, which `capabilitiesToJson` serves, so the public contract is unchanged. With no applicable row the Settings accordion is not rendered: Windows, macOS, plain Linux and the web demo never show it.
- The installed launcher is a copy under `~/.local/share/aurora/`; rerun `tools/steamos/install-gamemode-unit.sh` to pick up the check.
- Verified: `SettingsPanel.test.mjs`, `DashboardScreen.test.mjs`, `styles/dashboard.test.mjs`; the Config tests incl. the new default-and-persist case; `linux-app` builds; `bash -n` on the launcher. Not verified on the Deck: the toggle in a browser, and a Game Mode start with the flag off.

## Lessons
- none
