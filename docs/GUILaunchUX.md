# GUI Launch UX

Status: planning — Windows tray scoped for 1.0.2 (`Aurora-x2o`), Linux and
macOS shapes researched, opens listed at the bottom. See also
`docs/Building.md` (install/portable trees) and `CONTRIBUTING.md` (beads).

## Decided

- **Windows 1.0.2 (`Aurora-x2o`, open P2):** double-clicking `Aurora.exe`
  launches the app into the notification-overflow tray with tooltip and a
  right-click menu (Launch UI, Stop). No console window required. The
  checked-in `app/windows/app.ico` (16/32/48/256, `Aurora-05r`) is the tray
  icon source.
- **Sequencing with `Aurora-52o` (open):** single-instance lock is the
  near-prerequisite — without it a second double-click spawns a duplicate
  headless server (the exact failure 52o already names). Proposed edge
  `x2o depends on 52o`, not yet added. No incompatibility anywhere in this
  plan.
- **WebUI entry point is bookmark-stable:** default port `8215`
  (`Config::restServerPort`, `core/Runtime/include/Aurora/Runtime/Config.hpp`),
  persisted per config profile. Launch UI must open the *configured* port on
  `localhost`, not the printed string (`Aurora-2qj` tracks the `0.0.0.0`
  print wart). Bind failure currently runs on without a WebUI — Launch UI
  needs a defined behavior for that case (open, still underspecified).
- **Tray is enhancement, never requirement (Linux lesson):** the browser UI
  must work fully trayless. macOS reference agrees — `LSUIElement` agent,
  `NSStatusItem` menu, `SMAppService` login item — but macOS guarantees the
  menu-bar slot while Linux guarantees no slot at all.
- **Launch UI reuses `browsableAddress()` + configured port** (helper already
  in both app shells; shared, no duplication with `Aurora-2qj`). Gray out
  with the reason in the tooltip when unbound — no retry-on-click.
- **Second launch opens the configured URL and exits** (52o handoff; no IPC
  needed since instance one holds the port). Stop signals our own process
  only — nothing here kills by port, so a foreign squatter is never touched.
  Port changes are hand-edit `restServerPort` in `config.json` + restart
  (`setRestServerPort` has no UI callers).
- **Edges recorded:** `x2o → 52o`, `lx4 → 52o`. `Aurora-lx4` (P3, open) is
  the Linux SNI follow-up, agent-first, explicitly post-1.0.2.
- **First-run hint:** one-shot toast via `NIF_INFO` (renders as a modern toast on Win10+, no installer/AUMID needed) gated by a persisted flag
  (`isFirstSetup` precedent); tooltip carries long-term discoverability.

## Platform shapes

- **Windows:** Explorer double-click → single instance → `Shell_NotifyIcon`
  overflow icon + tooltip + menu. Still the sanctioned pattern on Win 11;
  new icons start in overflow with no self-promotion API, so first-run
  discoverability rests on the tooltip plus a hint (balloon/docs, not yet
  scoped in x2o).
- **Linux KDE / Ubuntu-GNOME / Mint / Xfce:** StatusNotifierItem over D-Bus
  + `com.canonical.dbusmenu` gives the near-Windows experience (panel tray
  zone, tooltip, menu). Hand-rolled D-Bus; no tray-capable dep in tree.
- **Linux stock GNOME (Fedora, Debian, Arch):** no tray host. Sanctioned
  path is the XDG Background portal → Quick Settings "Background Apps":
  presence + kill-switch only, no menu or tooltip. AppIndicator extension
  exists but cannot be assumed.
- **Linux, uniform everywhere:** XDG autostart `.desktop` for start-with-
  session. So the Linux scope narrows to *background agent first, SNI icon
  second*.
- **macOS:** reference only, not a target.

## Context numbers (2026-09 research)

- Linux desktop ~5–7% global (StatCounter, bot-inflation caveats); within it
  Ubuntu ~28%, Debian ~11% (Stack Overflow 2025, dev-skewed). No trustworthy
  DE census; GNOME is default on Ubuntu/Fedora/Debian/RHEL (likely majority
  of Aurora-type users), KDE on openSUSE/Kubuntu/SteamOS.

## Step beads (labels: 1.0.2, GUILaunchUX)

- Step 1 (lock): `Aurora-52o` (existing, tagged).
- Step 2 (tray icon + tooltip): `Aurora-x2o.1` (child of `x2o`).
- Step 3 (menu): `Aurora-x2o.2` (child of `x2o`).
- Step 4 (balloon + console decision): `Aurora-x2o.3` (child of `x2o`).
- Step 5 (agent trunk): `Aurora-lx4.1` (child of `lx4`).
- Step 6 (SNI icon + menu): `Aurora-lx4.2` (child of `lx4`).
- Step 7 (desktop integration): `Aurora-lx4.3` (child of `lx4`).

## Opens (drill-down done except where noted)

1. Missing version-contract test — untracked residue from the `qno` docs
   stream, not this plan: root CMake comment claims one, none found. File
   a bead or fix the comment.
2. Uncommitted `.beads/issues.jsonl` (x2o/lx4 tracking in this stream).
3. `StartupWMClass=Aurora` runtime confirmation (Linux side, with `lx4`).
4. Owner-held (1.0.1, not this plan): release zips + zip-first Quick Start;
   copy pass incl. "test script" Status language.
