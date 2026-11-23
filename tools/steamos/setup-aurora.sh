#!/bin/bash
# Aurora-hvxd: one-shot SteamOS setup for the Distrobox + Game Mode route.
# Run on the Deck host in Desktop Mode, from a checkout of the Aurora repo:
#   bash tools/steamos/setup-aurora.sh
# Creates the Arch Distrobox, installs the build dependencies, builds Aurora,
# installs the Game Mode launcher unit and adds a KDE menu entry. Idempotent:
# rerun it to update packages, rebuild after a `git pull` or repair the install.
# Overrides (environment):
#   AURORA_BOX        distrobox name (default aurora-dev)
#   AURORA_JOBS       build parallelism (default: nproc)
#   AURORA_SKIP_UNIT  1 = do not install the Game Mode launcher unit
#   AURORA_SKIP_MENU  1 = do not add the KDE menu entry
set -euo pipefail

BOX="${AURORA_BOX:-aurora-dev}"
JOBS="${AURORA_JOBS:-$(nproc)}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BIN_DIR="$SRC/build/linux-app/bin"
PKGS=(base-devel cmake ninja git pkgconf nodejs npm opencv curl
      libx11 libxext libxrandr libxdamage libxrender glib2 libpipewire pipewire
      aubio libsecret mbedtls3)

step() { printf '\n==> %s\n' "$*"; }
die()  { printf 'setup-aurora: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "run as the normal user (deck), not root"
[ -f "$SRC/CMakePresets.json" ] || die "cannot find the Aurora checkout at $SRC"
command -v distrobox >/dev/null || die "distrobox not found (it ships with SteamOS 3.5+)"
command -v podman    >/dev/null || die "podman not found"
case "$SRC" in "$HOME"/*) ;; *) die "put the checkout under $HOME so the box can see it (found $SRC)";; esac

step "1/5 Distrobox '$BOX'"
if distrobox list 2>/dev/null | awk -F'|' 'NR>1 {gsub(/ /,"",$2); print $2}' | grep -qx "$BOX"; then
  echo "already exists"
else
  distrobox create --yes --name "$BOX" --image docker.io/library/archlinux:latest
fi

# Everything below that needs the box goes through one helper; the first call
# also initializes the container (installs sudo, links the host session).
inbox() { distrobox enter "$BOX" -- bash -c "$1"; }

step "2/5 Packages in the box (pacman, a few minutes the first time)"
inbox "sudo pacman -Syu --needed --noconfirm ${PKGS[*]}"

step "3/5 Build Aurora (first build ~250 steps; later runs are incremental)"
inbox "set -e; cd '$SRC'
  export PKG_CONFIG_PATH=/usr/lib/mbedtls3/pkgconfig
  cmake --preset linux-app -G Ninja
  cmake --build build/linux-app -j$JOBS"
[ -x "$BIN_DIR/Aurora" ] || die "build finished but $BIN_DIR/Aurora is missing"

step "4/5 Game Mode launcher unit"
if [ "${AURORA_SKIP_UNIT:-0}" = 1 ]; then
  echo "skipped (AURORA_SKIP_UNIT=1)"
else
  mkdir -p "$HOME/.config/aurora"
  # The unit reads these; write them only when they differ from its defaults.
  env_file="$HOME/.config/aurora/gamemode.env"
  : > "$env_file.new"
  [ "$BIN_DIR" = "$HOME/Documents/Aurora/build/linux-app/bin" ] || echo "AURORA_BIN_DIR=$BIN_DIR" >> "$env_file.new"
  [ "$BOX" = aurora-dev ] || echo "AURORA_BOX=$BOX" >> "$env_file.new"
  if [ -s "$env_file.new" ]; then mv "$env_file.new" "$env_file"; else rm -f "$env_file.new" "$env_file"; fi
  bash "$SRC/tools/steamos/install-gamemode-unit.sh"
fi

step "5/5 KDE menu entry"
if [ "${AURORA_SKIP_MENU:-0}" = 1 ]; then
  echo "skipped (AURORA_SKIP_MENU=1)"
else
  apps="$HOME/.local/share/applications"
  mkdir -p "$apps"
  icon="$SRC/assets/brand/Logo_Square_Light_512.png"; [ -f "$icon" ] || icon=applications-multimedia
  cat > "$apps/aurora.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Aurora
Comment=Ambient lighting from your screen and audio
Exec=distrobox enter $BOX -- sh -c 'cd "$BIN_DIR" && exec ./Aurora'
Icon=$icon
Terminal=false
Categories=AudioVideo;Video;
EOF
  command -v update-desktop-database >/dev/null && update-desktop-database "$apps" || true
  echo "wrote $apps/aurora.desktop"
fi

cat <<EOF

Done. Next: launch "Aurora" from the application menu (Desktop Mode), then follow
docs/SteamOS.md from step 2 (Hue bridge, capture picker, pair your phone).
EOF
