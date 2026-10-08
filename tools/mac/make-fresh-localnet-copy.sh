#!/bin/sh
# Copies the built Aurora.app to a temp folder with a new bundle ID and a new
# LC_UUID, re-signed ad hoc, so macOS treats it as a never-seen app and shows
# the Local Network prompt again. macOS has no reset for that permission (see
# docs/lessons/macos-gui.md); both identifiers must change or the copy
# inherits the original's answer.
#
# Usage: tools/mac/make-fresh-localnet-copy.sh [path/to/Aurora.app] [--launch]
set -eu

src="build/mac-app/bin/Aurora.app"
launch=0
for arg in "$@"; do
  case "$arg" in
    --launch) launch=1 ;;
    *) src="$arg" ;;
  esac
done
[ -d "$src" ] || { echo "no app at $src" >&2; exit 1; }

dest_dir="$(mktemp -d "${TMPDIR:-/tmp}/aurora-fresh-localnet.XXXXXX")"
app="$dest_dir/Aurora.app"
cp -R "$src" "$app"

bundle_id="com.aurora.app.fresh$(date +%s)"
plutil -replace CFBundleIdentifier -string "$bundle_id" "$app/Contents/Info.plist"

python3 - "$app/Contents/MacOS/Aurora" <<'PY'
import os, struct, sys
path = sys.argv[1]
data = bytearray(open(path, 'rb').read())
LC_UUID = 0x1b
def patch(base):
    magic = struct.unpack_from('<I', data, base)[0]
    assert magic == 0xfeedfacf, 'expected 64-bit little-endian Mach-O'
    ncmds = struct.unpack_from('<I', data, base + 16)[0]
    off = base + 32
    for _ in range(ncmds):
        cmd, size = struct.unpack_from('<II', data, off)
        if cmd == LC_UUID:
            data[off + 8:off + 24] = os.urandom(16)
            return
        off += size
    raise SystemExit('no LC_UUID found')
if struct.unpack_from('>I', data, 0)[0] == 0xcafebabe:  # universal: patch every slice
    for i in range(struct.unpack_from('>I', data, 4)[0]):
        patch(struct.unpack_from('>I', data, 8 + 20 * i + 8)[0])
else:
    patch(0)
open(path, 'wb').write(data)
PY

codesign --force --deep --sign - "$app" >/dev/null 2>&1
echo "$app  ($bundle_id)"
[ "$launch" = 1 ] && open "$app"
exit 0
