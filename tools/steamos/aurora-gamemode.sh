#!/bin/bash
# Aurora-mjk0: Game Mode lifecycle for the Distrobox install route.
# Runs as the aurora-gamemode.service systemd --user unit. Waits for gamescope,
# evicts any stale Aurora, runs Aurora in the container with the gamescope
# display, and stops it when gamescope exits. Lifecycle only.
# Overrides (optional): ~/.config/aurora/gamemode.env
#   AURORA_BIN_DIR   dir holding the Aurora binary (default ~/Documents/Aurora/build/linux-app/bin)
#   AURORA_BOX       distrobox name (default aurora-dev)
# Aurora-xg8z: "gameModeAutostart": false in ~/.config/aurora/config.json (the
# Settings toggle) leaves Aurora stopped; read before each start.
unset LD_PRELOAD
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:$PATH"
BIN="${AURORA_BIN_DIR:-$HOME/Documents/Aurora/build/linux-app/bin}"
BOX="${AURORA_BOX:-aurora-dev}"
ENVF="/run/user/$(id -u)/gamescope-environment"
CFG="${AURORA_CONFIG_DIR:-$HOME/.config/aurora}/config.json"
log() { echo "$(date +%T) $*"; }
autostart_off() { grep -Eq '"gameModeAutostart"[[:space:]]*:[[:space:]]*false' "$CFG" 2>/dev/null; }

stop_aurora() {   # SIGTERM, then SIGKILL after 10 s; returns when gone
  pgrep -x Aurora >/dev/null || return 0
  pkill -x Aurora
  for _ in $(seq 20); do pgrep -x Aurora >/dev/null || return 0; sleep 0.5; done
  pkill -9 -x Aurora; sleep 1
}
guard=
cleanup() { [ -n "$guard" ] && kill "$guard" 2>/dev/null; stop_aurora; exit 0; }
trap cleanup TERM INT

log "launcher start pid=$$"
while true; do
  if pgrep -x gamescope-wl >/dev/null; then
    if autostart_off; then
      # Evict a Desktop Mode copy that rode over the switch, but start nothing; stay idle until
      # gamescope goes. A toggle flipped on mid-session starts Aurora at the next Game Mode start.
      log "Launch Automatically in Game Mode is off, stopping any running Aurora and not starting one"
      stop_aurora
      while pgrep -x gamescope-wl >/dev/null; do sleep 3; done
      continue
    fi
    sleep 8   # gamescope is still writing its env file and publishing its node
    gwd=$(grep -m1 '^GAMESCOPE_WAYLAND_DISPLAY=' "$ENVF" 2>/dev/null | cut -d= -f2)
    if [ -z "$gwd" ]; then log "no GAMESCOPE_WAYLAND_DISPLAY in $ENVF, retrying"; sleep 3; continue; fi
    log "gamescope up (display $gwd): evicting stale Aurora, starting"
    stop_aurora   # a Desktop Mode copy holds aurora.lock and the KDE portal capture
    ( while pgrep -x gamescope-wl >/dev/null; do sleep 3; done
      log "gamescope gone, stopping Aurora"; stop_aurora ) &
    guard=$!
    cd "$BIN" && distrobox enter "$BOX" -- env GAMESCOPE_WAYLAND_DISPLAY="$gwd" \
      XDG_SESSION_TYPE=x11 ./Aurora 2>&1 | sed 's/^/  aurora: /'
    log "Aurora exited"
    kill "$guard" 2>/dev/null; guard=
    sleep 5
  else
    sleep 3
  fi
done
