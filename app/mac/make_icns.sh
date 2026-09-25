#!/bin/sh
# Build an .icns for the Aurora.app bundle (Aurora-8mk.11) from the dark
# "A" logo (docs/README/Logo_Square.svg / Logo_Square_Dark.png), rasterized
# at each size directly from the vector source via qlmanage (macOS's
# QuickLook thumbnailer, the only SVG rasterizer available without adding
# a build dependency) rather than upsampling a single PNG -- every slot
# iconutil's .iconset format wants (16 through 1024) comes out crisp, not
# just the ones a raster source happened to ship at.
set -e

SVG_SRC="$1"      # docs/README/Logo_Square.svg
OUT_ICNS="$2"
WORK_DIR="$3"

ICONSET="${WORK_DIR}/Aurora.iconset"
RASTER_DIR="${WORK_DIR}/Aurora.iconset.raster"
rm -rf "${ICONSET}" "${RASTER_DIR}"
mkdir -p "${ICONSET}" "${RASTER_DIR}"

rasterize() {
  size="$1"
  out="$2"
  qlmanage -t -s "${size}" -o "${RASTER_DIR}" "${SVG_SRC}" >/dev/null 2>&1
  mv "${RASTER_DIR}/$(basename "${SVG_SRC}").png" "${out}"
}

rasterize 16   "${ICONSET}/icon_16x16.png"
rasterize 32   "${ICONSET}/icon_16x16@2x.png"
rasterize 32   "${ICONSET}/icon_32x32.png"
rasterize 64   "${ICONSET}/icon_32x32@2x.png"
rasterize 128  "${ICONSET}/icon_128x128.png"
rasterize 256  "${ICONSET}/icon_128x128@2x.png"
rasterize 256  "${ICONSET}/icon_256x256.png"
rasterize 512  "${ICONSET}/icon_256x256@2x.png"
rasterize 512  "${ICONSET}/icon_512x512.png"
rasterize 1024 "${ICONSET}/icon_512x512@2x.png"

rm -rf "${RASTER_DIR}"
iconutil -c icns "${ICONSET}" -o "${OUT_ICNS}"
rm -rf "${ICONSET}"
