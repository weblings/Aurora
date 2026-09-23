# SteamOS / Steam Deck support

Status: exploratory — no code or packaging changes yet, this is the
conversation-so-far writeup. Started from a manual test: running the
Debian/Ubuntu dependency list from [`README.md`](../README.md#L21) via
`sudo apt install ...` on a Steam Deck.

## Problem observed

Installing the apt dependency list directly onto SteamOS's root hit repeated
keyring corruption, even after a full `pacman-key --init` /
`pacman-key --populate archlinux` redo. Root cause isn't an expired keyring —
SteamOS's `pacman` is pinned to Valve's own repo snapshot, not stock Arch, so
package/signature state diverges from upstream Arch mirrors in ways that
corrupt on sync. Installing packages onto the live SteamOS root this way is
unsupported and fragile, and any changes get reverted by SteamOS updates
regardless (root is read-only by default; `steamos-readonly disable` is
required first and doesn't survive an OS update).

**Conclusion:** don't fight `pacman` on the SteamOS host at all — go around it.

## Candidate approaches

### Flatpak (recommended for end users)

- Deck ships Discover/flatpak already; no Developer Mode or terminal needed
  to install.
- Sandboxed — doesn't touch host pacman/keyring at all. All runtime deps
  (X11, PipeWire, aubio, curl, OpenCV, mbedtls) come from the Flatpak
  runtime/extensions instead of system packages.
- Tradeoff: needs a manifest built and maintained (none exists yet — only
  the apt-based lib list in `README.md` and prebuilt release zips). OpenCV +
  aubio make for a fairly heavy runtime.
- Capture access (see below) needs specific manifest permissions, not
  code changes — Aurora's existing Linux capture code already matches what
  Flatpak's sandbox model expects.

### Distrobox (better fit for developers / building from source)

- Installs an Arch or Ubuntu container via distrobox; deps installed there
  never touch the read-only host root, survives SteamOS updates.
- Not really a sandbox for capture purposes — bind-mounts the host's X11
  socket, Wayland/D-Bus session bus, and PipeWire socket into the container
  by default, so screen/audio capture behaves like a native install with no
  extra config.
- Tradeoff: still terminal/Developer-Mode work, so it's a build/dev path
  more than a low-friction path for regular users.

### Decky Loader plugin (Game Mode specific)

- Decky plugins are a Python backend + React frontend panel injected into
  Steam's Big Picture/Game Mode UI (Quick Access Menu), via a third-party
  (not Valve-official) loader whose plugin backends run as root.
- Sidesteps the packaging problem entirely rather than working around it:
  the plugin folder can bundle Aurora's compiled Linux binary and its `.so`
  deps directly, same "keep the folder together" model the release zip
  already uses. No apt/pacman/Flatpak runtime involved, so the keyring issue
  never comes up.
- Best fit for the Game-Mode capture case specifically: the backend runs in
  the same gamescope session as the game, as root, no sandbox to route
  through — the `GAMESCOPE_WAYLAND_DISPLAY` → direct Pipewire node path in
  [`GamescopeNodeMatch.hpp`](../input/linux/include/Aurora/Input/Linux/GamescopeNodeMatch.hpp)
  should work with no extra permission grants, unlike Flatpak's
  `--socket=pipewire` requirement.
- UI integration fits naturally: Aurora already serves its control UI over
  local HTTP bound to `127.0.0.1`
  ([`main.cpp:901`](../app/linux/src/main.cpp#L901)) rather than a native
  GUI, so a Decky panel could start/stop the process and iframe the
  existing web UI instead of reimplementing it. Unverified: whether Steam's
  embedded CEF panel allows iframing localhost without CSP/CORS friction.
- Tradeoffs: Decky Loader is unofficial and plugins run as root, a real
  trust consideration for both a Decky Store review and for users
  installing it. Also Game-Mode-specific — Desktop Mode users and non-Deck
  Arch users still need the Flatpak path, so this complements rather than
  replaces it.

### Rejected: installing onto the SteamOS host directly

`steamos-readonly disable` + raw `pacman`/apt-equivalent installs is the
approach that produced the keyring corruption above, and any changes are
wiped on the next SteamOS update regardless. Not viable as a supported path.

## Does Aurora's capture code actually work in either sandbox?

Yes — checked against the real Linux input plugin code
([`input/linux/src/`](../input/linux/src)), not just in theory.

Aurora's `SessionDispatch` already picks between three capture backends at
runtime (see [`LinuxCaptureAnalysis.md`](LinuxCaptureAnalysis.md)):

1. **X11** ([`X11Grabber.cpp`](../input/linux/src/X11Grabber.cpp)) — XShm +
   Xrandr, no portal involved.
2. **Wayland via `xdg-desktop-portal`'s ScreenCast interface**
   ([`XdgDesktopPortal.cpp`](../input/linux/src/XdgDesktopPortal.cpp)) — used
   on a normal desktop compositor (e.g. Deck Desktop Mode's KDE Plasma).
   Already persists a restore token so the user isn't re-prompted every
   launch.
3. **Gamescope direct Pipewire node** — detected via the
   `GAMESCOPE_WAYLAND_DISPLAY` env var, bypasses the portal entirely and
   connects straight to Pipewire's `gamescope` node
   ([`GamescopeNodeMatch.hpp`](../input/linux/include/Aurora/Input/Linux/GamescopeNodeMatch.hpp)).
   This is the path that matters for Deck **Game Mode**, since gamescope
   doesn't run a desktop-portal backend the way KDE/GNOME do.

Audio capture goes through PipeWire as well
([`AudioGrabber.cpp`](../input/linux/src/AudioGrabber.cpp)).

**Distrobox:** all three paths work unmodified — the container shares the
host's X11/Wayland/D-Bus/PipeWire sockets by design.

**Flatpak:** each path maps to a static, install-time manifest permission,
no runtime dialog needed beyond the portal's normal first-use consent:

| Capture path | Flatpak permission |
|---|---|
| X11 | `--socket=x11` (+ `--share=ipc` for XShm) |
| Wayland portal ScreenCast | `--talk-name=org.freedesktop.portal.Desktop` |
| Gamescope direct node + audio | `--socket=pipewire` |

No code changes identified as necessary for either sandbox — this is a
packaging/manifest problem, not a capability gap in the existing capture
code.

## Open questions / next steps

- No Flatpak manifest exists yet — next concrete step if this is pursued is
  drafting one (`org.freedesktop.Platform` runtime + the three permissions
  above + the apt-equivalent lib list from `README.md`).
- Not yet verified hands-on: whether Deck Game Mode's gamescope actually
  exposes the `gamescope` Pipewire node under a Flatpak sandbox with only
  `--socket=pipewire` granted (expected to work per Flatpak's permission
  model, matches how OBS Studio's Flatpak does Gamescope capture, but
  unconfirmed on real hardware).
- Distrobox path is untested end-to-end on a real Deck; assumed low-risk
  since it doesn't sandbox capture at all, but worth a real run before
  documenting it as a supported path.
- Decky plugin path is unverified on two fronts: whether Steam's embedded
  CEF panel can iframe a localhost server without CSP/CORS issues, and
  whether Decky Store review would accept a root-privileged plugin bundling
  a full capture/streaming binary.
