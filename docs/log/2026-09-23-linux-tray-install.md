# Linux tray install work (2026-09-23, paused)

Version 1.0.2 + install owns tray/launcher icon resolution. Launcher half
verified live; tray render on the owner's Ubuntu 22.04 stack stays open.

## Closed

- v1.0.2 bump (root `project()` + `CHANGELOG.txt` top, Aurora-qdk rule):
  committed as `b387fe5` from a second session mid-work. Rebuilt binary
  verified via `strings` → `1.0.2`; `/api/version` live read still pending.
- `aurora.desktop` → `aurora.desktop.in`; `Exec=` baked absolute from the
  configure-time prefix (`-DCMAKE_INSTALL_PREFIX`, app/linux/CMakeLists.txt).
  Install-time `--prefix` overrides do NOT rewrite `Exec=` (documented).
- `cmake --install` refreshes icon cache + desktop DB itself via
  best-effort `install(CODE)` hooks (warn-never-fail, skipped under
  `DESTDIR`). Quoted form defers `${CMAKE_INSTALL_PREFIX}` to install time,
  bakes `${CMAKE_INSTALL_DATADIR}` at configure (unavailable to the script).
- Building.md top recipe is now configure → build → test → install; autostart
  section drops the hand-edit-Exec step; architecture-process lesson updated.
- Verified: scratch-prefix install (8/8 icons valid, hooks ran, absolute
  Exec), superbuild + standalone-slice configures (standalone needs the
  documented `CMAKE_POLICY_VERSION_MINIMUM=3.5` pin — pre-existing glm floor).
- Live (owner box, ubuntu:GNOME X11): Activities entry works — icon,
  click-launch identical to bin. Install-side done.

## Paused: tray icon never renders on this stack

State: extension `ubuntu-appindicators@ubuntu.com` installed + ENABLED,
8 icons installed, cache refreshed, single instance ensured, installed
binary launched. Top bar stays bare. Shell restart after enabling
(Alt+F2 `r` / `killall -3`) untried — no function keys; logout/login
untried. Bead comment left on Aurora-lx4.3.

## Resume pointer

While the installed instance runs: `busctl --user list | grep -i status`
(item registered?) + app stderr `grep -i tray /tmp/aurora.log`
(`no session bus` / `registration failed`?). Distinguishes app-side
registration failure from shell-side render failure.

## Dead ends (do not repeat)

- Ghost holder: an older Aurora held the InstanceLock, so every new launch
  exited via the 52o handoff ("already running -- opening ..."). `pgrep -ax`
  the binary path before diagnosing tray; `kill`, relaunch installed binary.
- Sandboxed shells see a private PID list: `pgrep`/`busctl` empties from an
  agent shell prove nothing. Run process/bus checks in the owner's terminal.
- Paste breaks long commands mid-word: keep diagnostic one-liners <80 chars,
  no backslash continuations.

## StandaloneApps overlap

Install-rule changes (generated desktop, cache hooks) sit in Aurora-4mk's
clean-dir-smoke scope: re-run its smoke against the new install tree before
closing it. Windows-side StandaloneApps beads untouched.

## Uncommitted at pause

`app/linux/CMakeLists.txt`, `app/linux/aurora.desktop{,.in}` rename,
`docs/Building.md`, `docs/lessons/architecture-process.md`,
`.beads/issues.jsonl` (import + lx4.3 comment export).
