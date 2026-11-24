#!/bin/sh
# Does a Local Network grant survive an update that changes the executable
# UUID, and does it survive a reboot? (Aurora-lswm item 3, Aurora-e2j4.)
# TN3179 does not say, so this runs the experiment without touching the real
# com.aurora.app grant.
#
# It copies one Developer ID app twice under ONE throwaway bundle ID, patches
# a different LC_UUID into each, signs both with the Developer ID identity
# (ad hoc identity is unreliable for Local Network, see
# docs/lessons/macos-gui.md), then reads the host's "local_network" condition
# from GET /api/state.
#
# Default (no reboot):
#   1. install copy A, you answer the prompt, wait for the condition to clear;
#   2. replace A with copy B at the same path (the update), relaunch, read it.
#
# --reboot adds a restart between the two (forum threads report grants lost
# after a reboot):
#   1. install copy A, you answer the prompt, wait for the condition to clear;
#   2. quit A, write a login agent, restart the Mac (System Settings can still
#      cancel it: apps with unsaved work block the restart);
#   3. at login the agent relaunches A (grant after reboot, before any
#      update), then swaps in B and relaunches (update after reboot), records
#      both, removes itself, and posts a notification. Results land in
#      ~/Library/Application Support/AuroraUpdateGrantTest/result.txt.
#
# Runs with --fresh (temp config root); needs port 8215 free, so quit any
# running Aurora first. Leftovers: one throwaway entry in System Settings >
# Privacy & Security > Local Network (macOS 27.2+: select it, click remove).
#
# Usage: tools/mac/update-grant-test.sh [path/to/Aurora.app] [--identity NAME] [--reboot]
#   default app: build/notarize-out-1.1.2/Aurora.app
set -eu

port=8215
label="com.aurora.updategranttest"
state_dir="$HOME/Library/Application Support/AuroraUpdateGrantTest"
agent_plist="$HOME/Library/LaunchAgents/$label.plist"

condition() {
  # prints "blocked", "clear", or "no-api"
  body="$(curl -s -m 2 "http://127.0.0.1:$port/api/state" 2>/dev/null || true)"
  [ -n "$body" ] || { echo no-api; return; }
  printf '%s' "$body" | python3 -I -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("no-api"); raise SystemExit
print("blocked" if any(c.get("source") == "local_network" for c in d.get("conditions", [])) else "clear")'
}

uuid_of() {
  otool -l "$1/Contents/MacOS/Aurora" | awk '/LC_UUID/{f=1} f&&/uuid/{print $2; exit}'
}

launch() {
  open "$install_dir/Aurora.app" --args --fresh
  i=0
  while [ "$(condition)" = no-api ] && [ $i -lt 30 ]; do sleep 1; i=$((i + 1)); done
  [ "$(condition)" != no-api ] || { echo "API never came up" >&2; return 1; }
}

quit_app() {
  osascript -e "tell application id \"$bundle_id\" to quit" >/dev/null 2>&1 || true
  i=0
  while pgrep -f "$install_dir/Aurora.app/Contents/MacOS/Aurora" >/dev/null 2>&1 && [ $i -lt 15 ]; do sleep 1; i=$((i + 1)); done
  pkill -f "$install_dir/Aurora.app/Contents/MacOS/Aurora" 2>/dev/null || true
  sleep 1
}

# observe SECONDS: prints one line per 2 s, sets obs_last and obs_blocked (reads that were blocked)
observe() {
  obs_last=""; obs_blocked=0; i=0
  while [ $i -lt $(( $1 / 2 )) ]; do
    obs_last="$(condition)"
    printf '  t+%02ds %s\n' $((i * 2)) "$obs_last"
    [ "$obs_last" = blocked ] && obs_blocked=$((obs_blocked + 1))
    sleep 2; i=$((i + 1))
  done
}

# ---------------------------------------------------------------- after reboot
if [ "${1:-}" = "--after-reboot" ]; then
  work="$state_dir"
  install_dir="$work/Installed"
  result="$work/result.txt"
  # shellcheck disable=SC1091
  . "$work/env"
  exec >> "$work/after-reboot.log" 2>&1
  echo "==> after reboot, $(date)"
  # leave the agent in place only until this run finishes
  finish() {
    # notify and delete the plist first: bootout stops this very job
    osascript -e 'display notification "Local Network reboot test finished, see result.txt" with title "Aurora update-grant test"' >/dev/null 2>&1 || true
    rm -f "$agent_plist"
    launchctl bootout "gui/$(id -u)/$label" >/dev/null 2>&1 || true
  }
  sleep 30   # let login items and the network settle
  if [ "$(condition)" != no-api ]; then
    echo "port $port already answers after login; a login-item Aurora is running. Aborting." | tee "$result"
    finish; exit 1
  fi
  boot="$(sysctl -n kern.boottime | sed 's/.*sec = \([0-9]*\).*/\1/')"
  echo "==> A after reboot (boot time $boot)"
  ditto "$work/A/Aurora.app" "$install_dir/Aurora.app" 2>/dev/null || true
  launch || { echo "A did not start" | tee "$result"; finish; exit 1; }
  observe 40
  a_state="$obs_last"; a_blocked="$obs_blocked"
  quit_app
  echo "==> swap in B at the same path, relaunch"
  rm -rf "$install_dir/Aurora.app"
  ditto "$work/B/Aurora.app" "$install_dir/Aurora.app"
  launch || { echo "B did not start" | tee "$result"; finish; exit 1; }
  observe 40
  b_state="$obs_last"; b_blocked="$obs_blocked"
  quit_app
  {
    echo "Local Network reboot test, bundle $bundle_id"
    echo "A uuid $a_uuid, B uuid $b_uuid"
    echo "A after reboot, no update:  last=$a_state, blocked reads=$a_blocked of 20"
    echo "B after reboot and update:  last=$b_state, blocked reads=$b_blocked of 20"
    echo "Ask the owner whether a Local Network prompt appeared for A or B."
  } | tee "$result"
  finish
  exit 0
fi

# ---------------------------------------------------------------------- setup
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
src="$ROOT/build/notarize-out-1.1.2/Aurora.app"
identity=""
reboot=0
while [ $# -gt 0 ]; do
  case "$1" in
    --identity) identity="$2"; shift 2 ;;
    --reboot) reboot=1; shift ;;
    *) src="$1"; shift ;;
  esac
done
[ -d "$src" ] || { echo "no app at $src" >&2; exit 1; }
if [ -z "$identity" ]; then
  identity="$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application:[^"]*\)".*/\1/p' | head -1)"
fi
[ -n "$identity" ] || { echo "no Developer ID Application identity in the keychain" >&2; exit 1; }
if [ "$(condition)" != no-api ]; then
  echo "something already answers on port $port; quit Aurora first" >&2
  exit 1
fi

if [ "$reboot" = 1 ]; then
  [ ! -e "$agent_plist" ] || { echo "a previous run left $agent_plist; remove it first" >&2; exit 1; }
  rm -rf "$state_dir"
  mkdir -p "$state_dir"
  work="$state_dir"
else
  work="$(mktemp -d "${TMPDIR:-/tmp}/aurora-update-grant.XXXXXX")"
fi
bundle_id="com.aurora.app.updatetest$(date +%s)"
entitlements="$ROOT/app/mac/Aurora.entitlements"
install_dir="$work/Installed"

patch_uuid() {
  python3 - "$1" <<'PY'
import os, struct, sys
path = sys.argv[1]
data = bytearray(open(path, 'rb').read())
def patch(base):
    ncmds = struct.unpack_from('<I', data, base + 16)[0]
    off = base + 32
    for _ in range(ncmds):
        cmd, size = struct.unpack_from('<II', data, off)
        if cmd == 0x1b:
            data[off + 8:off + 24] = os.urandom(16)
            return
        off += size
    raise SystemExit('no LC_UUID found')
if struct.unpack_from('>I', data, 0)[0] == 0xcafebabe:
    for i in range(struct.unpack_from('>I', data, 4)[0]):
        patch(struct.unpack_from('>I', data, 8 + 20 * i + 8)[0])
else:
    patch(0)
open(path, 'wb').write(data)
PY
}

make_copy() {
  name="$1"
  mkdir -p "$work/$name"
  ditto "$src" "$work/$name/Aurora.app"
  plutil -replace CFBundleIdentifier -string "$bundle_id" "$work/$name/Aurora.app/Contents/Info.plist"
  patch_uuid "$work/$name/Aurora.app/Contents/MacOS/Aurora"
  xattr -cr "$work/$name/Aurora.app"
  codesign --force --deep --options runtime --entitlements "$entitlements" \
    --sign "$identity" "$work/$name/Aurora.app" >/dev/null 2>&1
  codesign --verify --strict "$work/$name/Aurora.app"
}

echo "==> building copies A and B under $bundle_id (signed: $identity)"
make_copy A
make_copy B
a_uuid="$(uuid_of "$work/A/Aurora.app")"
b_uuid="$(uuid_of "$work/B/Aurora.app")"
echo "A uuid $a_uuid"
echo "B uuid $b_uuid"
for c in A B; do
  codesign -dv "$work/$c/Aurora.app" 2>&1 | grep -E "Identifier=|TeamIdentifier=|Authority=Developer" | sed "s/^/$c: /"
done

mkdir -p "$install_dir"

echo
echo "==> step 1: install A, launch"
ditto "$work/A/Aurora.app" "$install_dir/Aurora.app"
launch
echo "A launched. Answer the Local Network prompt with Allow (if none appears, note that)."
echo "Watching the condition for up to 90 s..."
i=0; state=""; clear_n=0
while [ $i -lt 45 ]; do
  state="$(condition)"
  printf '  t+%02ds %s\n' $((i * 2)) "$state"
  if [ "$state" = clear ]; then clear_n=$((clear_n + 1)); else clear_n=0; fi
  [ "$clear_n" -ge 5 ] && break
  sleep 2; i=$((i + 1))
done
a_state="$state"

# ------------------------------------------------------------- reboot variant
if [ "$reboot" = 1 ]; then
  quit_app
  if [ "$a_state" != clear ]; then
    echo "A never reached clear, so there is no grant to test across a reboot. Not restarting."
    echo "State kept in $work. Re-run when ready."
    exit 1
  fi
  cp "$0" "$work/update-grant-test.sh"
  chmod +x "$work/update-grant-test.sh"
  {
    echo "bundle_id='$bundle_id'"
    echo "a_uuid='$a_uuid'"
    echo "b_uuid='$b_uuid'"
  } > "$work/env"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$agent_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array>
    <string>/bin/sh</string><string>$work/update-grant-test.sh</string><string>--after-reboot</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
  <key>StandardOutPath</key><string>$work/agent.out</string>
  <key>StandardErrorPath</key><string>$work/agent.out</string>
</dict></plist>
PLIST
  plutil -lint "$agent_plist" >/dev/null
  echo
  echo "==> grant is clear on A. Restarting the Mac in 20 s (save your work; an app with unsaved changes can cancel it)."
  echo "    After login the agent runs the rest and writes $work/result.txt."
  echo "    To abort now: rm '$agent_plist'"
  sleep 20
  [ -e "$agent_plist" ] || { echo "aborted"; exit 1; }
  osascript -e 'tell application "System Events" to restart'
  exit 0
fi

# ----------------------------------------------------------------- no reboot
echo
echo "==> step 2: quit A, replace with B at the same path (the update), relaunch"
quit_app
rm -rf "$install_dir/Aurora.app"
ditto "$work/B/Aurora.app" "$install_dir/Aurora.app"
launch
observe 40
b_state="$obs_last"; seen_blocked="$obs_blocked"
printf 'Did a Local Network prompt appear when B launched? [y/n/unsure] '
read -r prompted || prompted="?"
quit_app

echo
echo "==> result ($bundle_id)"
echo "  A after Allow:           $a_state"
echo "  B after the swap:        $b_state (blocked reads: $seen_blocked of 20)"
echo "  prompt shown for B:      $prompted"
if [ "$a_state" = clear ] && [ "$b_state" = clear ] && [ "$seen_blocked" = 0 ] && [ "$prompted" = n ]; then
  echo "  => grant SURVIVED a Developer ID update with a new UUID (lswm item 3: not the cause)"
elif [ "$a_state" = clear ] && [ "$b_state" = clear ] && [ "$seen_blocked" = 0 ] && [ "$prompted" != y ]; then
  echo "  => banner never returned for B; prompt answer was '$prompted', so not conclusive about a hidden re-prompt"
elif [ "$a_state" = clear ]; then
  echo "  => grant did NOT cleanly survive the UUID change (evidence for lswm item 3 / e2j4)"
else
  echo "  => inconclusive: A never reached clear, so there was no grant to carry over"
fi
echo "Copies are in $work. Remove the throwaway entry in System Settings > Local Network."
