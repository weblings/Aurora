#!/usr/bin/env bash
# Build hue_driver against a huenicorn checkout (or a git ref of it) and run
# the Hue loader checks against tools/fake-hue-bridge. See README.md.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
bridge="$here/../fake-hue-bridge/fake_bridge.py"
src="${HUENICORN_SRC:-$here/../../../huenicorn-fork}"
ref=""
deps_include="${DEPS_INCLUDE:-}"
port=18543
checks=()

usage() {
  echo "usage: $0 [--src DIR] [--ref GIT_REF] [--deps-include DIR] [--port N] [fetch|selector...]" >&2
  exit 64
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --src) src="$2"; shift 2 ;;
    --ref) ref="$2"; shift 2 ;;
    --deps-include) deps_include="$2"; shift 2 ;;
    --port) port="$2"; shift 2 ;;
    -h|--help|-*) usage ;;
    fetch|selector) checks+=("$1"); shift ;;
    *) usage ;;
  esac
done
[[ ${#checks[@]} -eq 0 ]] && checks=(fetch selector)
src="$(cd "$src" && pwd)"

source "$here/lib.sh"
build="$(prepare_tree hue)"
find_dep_includes

echo "building hue_driver: $src (${ref:-working tree})"
# _GLIBCXX_DEBUG must cover every TU (it changes container layouts); it is what catches finding 8
# --gc-sections drops ApiTools' unused registration code, whose Platform::adapter would pull in every grabber
g++ -std=c++20 -O0 -g -D_GLIBCXX_DEBUG -Wno-deprecated-enum-enum-conversion -ffunction-sections -Wl,--gc-sections \
  ${dep_flags[@]+"${dep_flags[@]}"} -I "$build/tree/include" \
  "$here/hue_driver.cpp" \
  "$build/tree/src/Hue/Api/ApiTools.cpp" \
  "$build/tree/src/Hue/Api/Channel.cpp" \
  "$build/tree/src/Hue/Api/EntertainmentConfigurationSelector.cpp" \
  "$build/tree/src/Hue/Auth/Credentials.cpp" \
  "$build/tree/src/Network/Http/Client/CurlClient.cpp" \
  "$build/tree/src/Core/Logger.cpp" \
  $(pkg-config --cflags --libs libcurl opencv4) -o "$build/hue_driver"

pids=()
cleanup() { [[ ${#pids[@]} -gt 0 ]] && kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT

start_bridge() {  # port, extra args...
  local p="$1"; shift
  python3 "$bridge" --port "$p" "$@" >"$build/bridge-$p.log" 2>&1 &
  pids+=($!)
  for _ in $(seq 50); do
    grep -q listening "$build/bridge-$p.log" 2>/dev/null && return 0
    sleep 0.1
  done
  echo "fake bridge on port $p did not start:" >&2
  cat "$build/bridge-$p.log" >&2
  exit 1
}

# light-1 is in conf-living-room; 3s outlasts huenicorn's 1s curl timeout
stalled=light-1
start_bridge "$port" --stall-light "$stalled"
start_bridge "$((port + 1))"

fail=0
for check in "${checks[@]}"; do
  echo "== $check"
  set +e
  case "$check" in
    fetch) "$build/hue_driver" fetch "127.0.0.1:$port" "$stalled" ;;
    selector) "$build/hue_driver" selector "127.0.0.1:$((port + 1))" ;;
  esac
  rc=$?
  set -e
  report_rc "$rc" || fail=1
done
exit $fail
