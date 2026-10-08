#!/usr/bin/env bash
# Build capture_driver against a huenicorn checkout (or a git ref of it) and
# run the capture-pipeline checks. See README.md.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
src="${HUENICORN_SRC:-$here/../../../huenicorn-fork}"
ref=""
deps_include="${DEPS_INCLUDE:-}"

usage() {
  echo "usage: $0 [--src DIR] [--ref GIT_REF] [--deps-include DIR]" >&2
  exit 64
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --src) src="$2"; shift 2 ;;
    --ref) ref="$2"; shift 2 ;;
    --deps-include) deps_include="$2"; shift 2 ;;
    *) usage ;;
  esac
done
src="$(cd "$src" && pwd)"

source "$here/lib.sh"
build="$(prepare_tree capture)"
find_dep_includes

# Runtime.cpp can't be linked alone, so the driver mirrors its alpha-drop
# condition; read which version this tree has
runtime_drops_bgra=0
grep -q 'format == Imaging::PixelFormat::BGRA){' "$build/tree/src/Core/Runtime.cpp" && runtime_drops_bgra=1

echo "building capture_driver: $src (${ref:-working tree}), Runtime alpha drop covers BGRA: $runtime_drops_bgra"
g++ -std=c++20 -O0 -g -Wno-deprecated-enum-enum-conversion -DRUNTIME_DROPS_BGRA=$runtime_drops_bgra \
  ${dep_flags[@]+"${dep_flags[@]}"} -I "$build/tree/include" \
  "$here/capture_driver.cpp" \
  "$build/tree/src/Imaging/ImageProcessing.cpp" \
  "$build/tree/src/Core/Logger.cpp" \
  $(pkg-config --cflags --libs opencv4) -o "$build/capture_driver"

set +e
"$build/capture_driver"
rc=$?
set -e
report_rc "$rc" || exit 1
exit $rc
