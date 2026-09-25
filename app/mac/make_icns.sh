#!/bin/sh
# Build an .icns for the Aurora.app bundle (Aurora-8mk.11) from the
# multi-resolution icon set already shipped for the Linux tray icon
# (app/linux/icons/hicolor/*/apps/aurora.png), same "A" logo design.
# That set tops out at 256x256; iconutil's .iconset format wants up to
# 1024x1024 (icon_512x512@2x), so the two largest slots are upsampled from
# the 256px source via sips -- soft, but only for those two, not the
# whole set like starting from a single 256px PNG would be.
set -e

ICONS_DIR="$1"   # app/linux/icons/hicolor
OUT_ICNS="$2"
WORK_DIR="$3"

ICONSET="${WORK_DIR}/Aurora.iconset"
rm -rf "${ICONSET}"
mkdir -p "${ICONSET}"

cp "${ICONS_DIR}/16x16/apps/aurora.png"   "${ICONSET}/icon_16x16.png"
cp "${ICONS_DIR}/32x32/apps/aurora.png"   "${ICONSET}/icon_16x16@2x.png"
cp "${ICONS_DIR}/32x32/apps/aurora.png"   "${ICONSET}/icon_32x32.png"
cp "${ICONS_DIR}/64x64/apps/aurora.png"   "${ICONSET}/icon_32x32@2x.png"
cp "${ICONS_DIR}/128x128/apps/aurora.png" "${ICONSET}/icon_128x128.png"
cp "${ICONS_DIR}/256x256/apps/aurora.png" "${ICONSET}/icon_128x128@2x.png"
cp "${ICONS_DIR}/256x256/apps/aurora.png" "${ICONSET}/icon_256x256.png"
sips -z 512 512  "${ICONS_DIR}/256x256/apps/aurora.png" --out "${ICONSET}/icon_256x256@2x.png" >/dev/null
sips -z 512 512  "${ICONS_DIR}/256x256/apps/aurora.png" --out "${ICONSET}/icon_512x512.png"     >/dev/null
sips -z 1024 1024 "${ICONS_DIR}/256x256/apps/aurora.png" --out "${ICONSET}/icon_512x512@2x.png" >/dev/null

iconutil -c icns "${ICONSET}" -o "${OUT_ICNS}"
rm -rf "${ICONSET}"
