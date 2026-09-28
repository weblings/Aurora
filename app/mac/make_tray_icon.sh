#!/bin/sh
# Build the menu-bar tray icon (Aurora-qps.2) from the same dark "A" logo
# master make_icns.sh already uses (docs/README/Logo_Square_Dark_1024.png),
# downsampled with sips -- only ever downsampling, matching make_icns.sh's
# own reasoning (see that script's header comment).
#
# Ships full color, not pre-blackened: NSImage's `template` flag (set at
# load time in TrayIcon.mm) discards RGB entirely and uses only the alpha
# channel as a mask, so there's no separate monochrome asset to maintain --
# confirmed empirically before writing this script (a throwaway CoreGraphics
# tool simulated the real isTemplate rendering against this exact source at
# both 18px and 36px; both the "A" and the aurora-wave overlay survive as
# distinct shape once flattened, legible at both sizes, see the qps.2 bead
# for the rendered previews).
#
# Two sizes, no @3x (menu bar icons don't use it): 18x18 (@1x) and 36x36
# (@2x, Retina). NSBundle's imageForResource: picks the @2x variant
# automatically on Retina displays when both live in the same Resources
# directory following Apple's naming convention -- no asset catalog needed.
set -e

PNG_SRC="$1"      # docs/README/Logo_Square_Dark_1024.png
OUT_DIR="$2"

sips -z 18 18 "${PNG_SRC}" --out "${OUT_DIR}/tray-icon.png" >/dev/null
sips -z 36 36 "${PNG_SRC}" --out "${OUT_DIR}/tray-icon@2x.png" >/dev/null
