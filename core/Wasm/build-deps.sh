#!/usr/bin/env bash
# Builds the pinned OpenCV (core and imgproc, static) for WASM and for the native parity
# reference, and unpacks the pinned aubio source. Usage: build-deps.sh <prefix> [wasm|native|aubio|all]
# Results: <prefix>/opencv-wasm, <prefix>/opencv-native, <prefix>/aubio-src. WASM needs emcmake on PATH.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=versions.env
source "$HERE/versions.env"

PREFIX="${1:?usage: build-deps.sh <prefix> [wasm|native|aubio|all]}"
WHAT="${2:-all}"
mkdir -p "$PREFIX"
PREFIX="$(cd "$PREFIX" && pwd)"
JOBS="${JOBS:-$( (nproc || sysctl -n hw.ncpu || echo 4) 2>/dev/null )}"
GEN=()
command -v ninja >/dev/null 2>&1 && GEN=(-G Ninja)

fetch() { # url sha256 file
  if [ ! -f "$3" ]; then curl -fsSL --retry 3 -o "$3.part" "$1" && mv "$3.part" "$3"; fi
  echo "$2  $3" | sha256sum -c - >/dev/null || { echo "SHA256 mismatch for $3" >&2; exit 1; }
}

unpack_opencv() {
  mkdir -p "$PREFIX/downloads" "$PREFIX/src"
  fetch "$OPENCV_URL" "$OPENCV_SHA256" "$PREFIX/downloads/opencv-$OPENCV_VERSION.tar.gz"
  [ -d "$PREFIX/src/opencv-$OPENCV_VERSION" ] || tar -xzf "$PREFIX/downloads/opencv-$OPENCV_VERSION.tar.gz" -C "$PREFIX/src"
}

# The spike's flags. Native drops only the wasm simd flags.
COMMON=(-DCMAKE_BUILD_TYPE=Release -DBUILD_LIST=core,imgproc -DBUILD_SHARED_LIBS=OFF
  -DCPU_BASELINE= -DCPU_DISPATCH= -DCV_TRACE=OFF -DWITH_PTHREADS_PF=OFF -DWITH_ITT=OFF
  -DWITH_IPP=OFF -DWITH_OPENCL=OFF -DWITH_PROTOBUF=OFF -DWITH_QUIRC=OFF -DWITH_EIGEN=OFF
  -DBUILD_TESTS=OFF -DBUILD_PERF_TESTS=OFF -DBUILD_EXAMPLES=OFF -DBUILD_DOCS=OFF
  -DBUILD_opencv_apps=OFF -DBUILD_JAVA=OFF -DBUILD_opencv_python3=OFF -DBUILD_PACKAGE=OFF)

build_opencv() { # name installDir configure-command... (extra args after)
  local name="$1" dest="$2"; shift 2
  if [ -f "$dest/lib/libopencv_imgproc.a" ]; then echo "build-deps: $dest exists, skipping"; return; fi
  if [ "$name" = wasm ]; then
    command -v emcmake >/dev/null || { echo "emcmake not on PATH (activate emsdk $EMSDK_VERSION)" >&2; exit 1; }
  fi
  unpack_opencv
  local build="$PREFIX/build-opencv-$name"
  "$@" -S "$PREFIX/src/opencv-$OPENCV_VERSION" -B "$build" "${GEN[@]}" "${COMMON[@]}" -DCMAKE_INSTALL_PREFIX="$dest"
  cmake --build "$build" --config Release -j "$JOBS"
  cmake --install "$build" --config Release
  rm -rf "$build"
}

if [ "$WHAT" = wasm ] || [ "$WHAT" = all ]; then
  build_opencv wasm "$PREFIX/opencv-wasm" emcmake cmake -DCMAKE_C_FLAGS=-msimd128 -DCMAKE_CXX_FLAGS=-msimd128
fi

if [ "$WHAT" = native ] || [ "$WHAT" = all ]; then
  build_opencv native "$PREFIX/opencv-native" cmake
fi

if [ "$WHAT" = aubio ] || [ "$WHAT" = all ]; then
  mkdir -p "$PREFIX/downloads"
  fetch "$AUBIO_URL" "$AUBIO_SHA256" "$PREFIX/downloads/aubio-$AUBIO_COMMIT.tar.gz"
  if [ ! -d "$PREFIX/aubio-src" ]; then
    mkdir -p "$PREFIX/aubio-src"
    tar -xzf "$PREFIX/downloads/aubio-$AUBIO_COMMIT.tar.gz" -C "$PREFIX/aubio-src" --strip-components=1
  fi
fi
echo "build-deps: $WHAT done under $PREFIX"
