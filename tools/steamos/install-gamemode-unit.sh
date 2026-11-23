#!/bin/bash
# Aurora-mjk0: install and enable the Game Mode launcher unit (run on the host
# in Desktop Mode). Safe to rerun; it replaces the installed copies.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
install -Dm755 "$here/aurora-gamemode.sh" "$HOME/.local/share/aurora/aurora-gamemode.sh"
install -Dm644 "$here/aurora-gamemode.service" "$HOME/.config/systemd/user/aurora-gamemode.service"
systemctl --user daemon-reload
systemctl --user enable aurora-gamemode.service
systemctl --user restart aurora-gamemode.service
echo "Installed. Log: journalctl --user -u aurora-gamemode"
