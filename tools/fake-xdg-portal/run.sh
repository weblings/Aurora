#!/usr/bin/env bash
# Build the driver against a huenicorn checkout and run fake-portal modes,
# each on its own private dbus-run-session bus. See README.md.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
src="${HUENICORN_SRC:-$here/../../../huenicorn-fork}"
ref=""
asan=0
timeout=5
modes=()

usage() {
  echo "usage: $0 [--src DIR] [--ref GIT_REF] [--asan] [--timeout SECS] [MODE...]" >&2
  echo "modes: $(python3 -c "import sys; sys.path.insert(0, '$here'); import fake_portal; print(' '.join(fake_portal.MODES))")" >&2
  exit 64
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --src) src="$2"; shift 2 ;;
    --ref) ref="$2"; shift 2 ;;
    --asan) asan=1; shift ;;
    --timeout) timeout="$2"; shift 2 ;;
    -h|--help) usage ;;
    -*) usage ;;
    *) modes+=("$1"); shift ;;
  esac
done

src="$(cd "$src" && pwd)"
if [[ ${#modes[@]} -eq 0 ]]; then
  read -r -a modes <<< "$(cd "$here" && python3 -c 'import fake_portal; print(" ".join(fake_portal.MODES))')"
fi

portal_rel="src/Grabber/GnuLinux/Pipewire/XdgDesktopPortal.cpp"
tag="${ref:-worktree}"
tag="${tag//\//_}"
[[ $asan -eq 1 ]] && tag="$tag-asan"
build="$here/build/$tag"
mkdir -p "$build"

# --ref takes only the portal .cpp from git; headers come from the checkout
portal_cpp="$src/$portal_rel"
if [[ -n "$ref" ]]; then
  portal_cpp="$build/XdgDesktopPortal.cpp"
  git -C "$src" show "$ref:$portal_rel" > "$portal_cpp"
fi

# -O0: the portal thread spins on a plain bool that -O2 may hoist out of the loop
flags=(-std=c++20 -O0 -g -pthread)
[[ $asan -eq 1 ]] && flags+=(-fsanitize=address -fno-omit-frame-pointer)

echo "building driver: $src (${ref:-working tree})$([[ $asan -eq 1 ]] && echo ', ASan' || true)"
# shim first so its Config.hpp wins over the real one
g++ "${flags[@]}" -I "$here/shim" -I "$src/include" \
  "$here/driver.cpp" "$portal_cpp" "$src/src/Core/Logger.cpp" \
  $(pkg-config --cflags --libs gio-unix-2.0) -o "$build/driver"

# Sanitizers exit 1 by default, which would read as "settled false"; leaks and crashes share this code
export ASAN_OPTIONS="exitcode=23${ASAN_OPTIONS:+:$ASAN_OPTIONS}"

fail=0
for mode in "${modes[@]}"; do
  echo "== $mode"
  set +e
  dbus-run-session -- bash -c '
    python3 "$1/fake_portal.py" "$2" & fake=$!
    gdbus wait --session --timeout 5 org.freedesktop.portal.Desktop || exit 99
    "$3" "$4"; rc=$?
    kill $fake 2>/dev/null
    exit $rc
  ' _ "$here" "$mode" "$build/driver" "$timeout"
  rc=$?
  set -e
  case $rc in
    0|1|2) ;;
    23) echo "RESULT: sanitizer reported a leak or crash (see above)"; fail=1 ;;
    99) echo "RESULT: fake portal never owned the bus name"; fail=1 ;;
    *) echo "RESULT: crashed (exit $rc$([[ $rc -gt 128 ]] && echo ", signal $((rc - 128))"))"; fail=1 ;;
  esac
done
exit $fail
