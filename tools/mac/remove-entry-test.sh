#!/bin/sh
# Does the Local Network remove (-) button (System Settings > Privacy & Security >
# Local Network, macOS 27.2+) reset an app to "never asked"? (Aurora-lswm item 4.)
#
# Two stages, with you in between:
#   tools/mac/remove-entry-test.sh grant [path/to/Aurora.app]
#       builds one copy under a throwaway bundle ID (Developer ID signed, new
#       UUID), launches it with --fresh, and waits up to 90 s for the
#       "local_network" condition to clear. Click Allow on the prompt.
#   (you) select that app in the Local Network list and click the - button
#   tools/mac/remove-entry-test.sh relaunch
#       launches the same app again and watches the condition for 60 s.
#       Prompt back (condition "blocked" until you answer) = removal reset it.
#       Condition clear with no prompt = removal did not reset the grant.
# State lives in ~/Library/Application Support/AuroraRemoveEntryTest. Run
# "clean" afterwards (or delete that folder); remove the entry in Settings too.
set -eu

port=8215
state_dir="$HOME/Library/Application Support/AuroraRemoveEntryTest"
app="$state_dir/Aurora.app"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

condition() {
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

launch() {
  open "$app" --args --fresh
  i=0
  while [ "$(condition)" = no-api ] && [ $i -lt 30 ]; do sleep 1; i=$((i + 1)); done
  [ "$(condition)" != no-api ] || { echo "API never came up" >&2; exit 1; }
}

quit_app() {
  pkill -f "$app/Contents/MacOS/Aurora" 2>/dev/null || true
  sleep 2
}

case "${1:-}" in
  grant)
    src="${2:-$ROOT/build/notarize-out-1.1.2/Aurora.app}"
    [ -d "$src" ] || { echo "no app at $src" >&2; exit 1; }
    [ "$(condition)" = no-api ] || { echo "port $port is busy; quit Aurora first" >&2; exit 1; }
    identity="$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application:[^"]*\)".*/\1/p' | head -1)"
    [ -n "$identity" ] || { echo "no Developer ID Application identity" >&2; exit 1; }
    rm -rf "$state_dir"; mkdir -p "$state_dir"
    bundle_id="com.aurora.app.removetest$(date +%s)"
    ditto "$src" "$app"
    plutil -replace CFBundleIdentifier -string "$bundle_id" "$app/Contents/Info.plist"
    python3 - "$app/Contents/MacOS/Aurora" <<'PY'
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
    xattr -cr "$app"
    codesign --force --deep --options runtime --entitlements "$ROOT/app/mac/Aurora.entitlements" \
      --sign "$identity" "$app" >/dev/null 2>&1
    codesign --verify --strict "$app"
    echo "$bundle_id" > "$state_dir/bundle_id"
    echo "==> $bundle_id built and signed. Launching; click Allow on the prompt."
    launch
    i=0; clear_n=0
    while [ $i -lt 45 ]; do
      state="$(condition)"
      printf '  t+%02ds %s\n' $((i * 2)) "$state"
      if [ "$state" = clear ]; then clear_n=$((clear_n + 1)); else clear_n=0; fi
      [ "$clear_n" -ge 5 ] && break
      sleep 2; i=$((i + 1))
    done
    quit_app
    if [ "$clear_n" -ge 5 ]; then
      echo "==> GRANTED for $bundle_id. Now remove it in System Settings > Privacy & Security > Local Network (select it, click -), then run: $0 relaunch"
    else
      echo "==> never reached clear; no grant to remove. Re-run grant."; exit 1
    fi
    ;;
  relaunch)
    [ -d "$app" ] || { echo "run grant first" >&2; exit 1; }
    [ "$(condition)" = no-api ] || { echo "port $port is busy; quit Aurora first" >&2; exit 1; }
    echo "==> relaunching $(cat "$state_dir/bundle_id") (watch for a prompt)"
    launch
    i=0; blocked=0
    while [ $i -lt 30 ]; do
      state="$(condition)"
      printf '  t+%02ds %s\n' $((i * 2)) "$state"
      [ "$state" = blocked ] && blocked=$((blocked + 1))
      sleep 2; i=$((i + 1))
    done
    quit_app
    echo "==> blocked reads: $blocked of 30"
    if [ "$blocked" -gt 0 ]; then
      echo "    removal reset the grant (the app was asked again / blocked until answered)"
    else
      echo "    condition stayed clear: either removal did not reset the grant, or you removed a different entry"
    fi
    ;;
  clean)
    quit_app
    rm -rf "${state_dir:?}"
    echo "state folder removed; remove the entry in System Settings if it is still listed"
    ;;
  *) echo "usage: $0 grant [app] | relaunch | clean" >&2; exit 2 ;;
esac
