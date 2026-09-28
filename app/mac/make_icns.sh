#!/bin/sh
# Build an .icns for the Aurora.app bundle (Aurora-8mk.11) from the dark
# "A" logo's 1024px transparent master (assets/brand/Logo_Square_Dark_1024.png),
# downsampled with sips (a plain bitmap resizer, ships with every Mac) for
# every smaller .iconset slot -- only ever downsampling, never up, so
# nothing comes out soft.
#
# Previously rasterized directly from assets/brand/Logo_Square.svg via
# qlmanage (macOS's QuickLook thumbnailer) instead, to get crisp results at
# every size without a real SVG-rasterizer dependency. That produced a
# genuinely broken icon, confirmed by extracting the built .icns and
# comparing it against the source PNG: qlmanage flattened the transparent
# background onto opaque white, and didn't preserve the SVG's own
# centering -- the artwork came out compressed into roughly the top 70% of
# the frame with a large dead zone at the bottom, not what the vector
# source actually specifies. qlmanage is a Finder-preview-thumbnail
# generator, not an icon compiler, and isn't a faithful rasterizer for
# this. sips has none of that behavior -- it just resizes an already-
# correct bitmap -- so this needs a real transparent master at the largest
# size actually used (1024) rather than the SVG at all.
set -e

PNG_SRC="$1"      # assets/brand/Logo_Square_Dark_1024.png
OUT_ICNS="$2"
WORK_DIR="$3"

ICONSET="${WORK_DIR}/Aurora.iconset"
rm -rf "${ICONSET}"
mkdir -p "${ICONSET}"

resize() {
  size="$1"
  out="$2"
  sips -z "${size}" "${size}" "${PNG_SRC}" --out "${out}" >/dev/null
}

resize 16   "${ICONSET}/icon_16x16.png"
resize 32   "${ICONSET}/icon_16x16@2x.png"
resize 32   "${ICONSET}/icon_32x32.png"
resize 64   "${ICONSET}/icon_32x32@2x.png"
resize 128  "${ICONSET}/icon_128x128.png"
resize 256  "${ICONSET}/icon_128x128@2x.png"
resize 256  "${ICONSET}/icon_256x256.png"
resize 512  "${ICONSET}/icon_256x256@2x.png"
resize 512  "${ICONSET}/icon_512x512.png"
resize 1024 "${ICONSET}/icon_512x512@2x.png"

iconutil -c icns "${ICONSET}" -o "${OUT_ICNS}"
rm -rf "${ICONSET}"
