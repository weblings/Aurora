#!/bin/bash
# Sign, notarize and staple Aurora.app (Aurora-qy5.4).
#
#   tools/mac/sign-notarize.sh build/mac-app/bin/Aurora.app \
#       --identity "Developer ID Application: Name (TEAMID)" \
#       --keychain-profile aurora-notary  [--out DIR] [--entitlements FILE] [--dry-run]
#
# Steps: copy the app -> bundle dylibs + licenses and sign inside-out
# (bundle-dylibs.sh) -> verify-bundle.sh -> ditto zip -> notarytool submit --wait
# -> stapler staple/validate -> spctl + codesign verification -> re-zip the
# stapled app. The input bundle is never modified; results go to --out
# (default: ./notarize-out).
#
# --dry-run (implied for the ad-hoc identity "-") does everything up to, and
# prints, the notarytool submit step; ad-hoc without --dry-run is refused.
#
# HARD RULE: no secrets here, in the repo, or on any command line. Both
# arguments are *names*: the signing identity as it appears in the keychain, and
# a notarytool keychain profile created once, interactively, with
#   xcrun notarytool store-credentials <profile>
# (which prompts for and keeps the key/ID/issuer in the keychain). Identity and
# profile may also come from AURORA_SIGN_IDENTITY / AURORA_NOTARY_PROFILE, so CI
# can inject them from its own secret store; this script never reads or writes a
# .p8/.p12 or key ID/issuer ID, and refuses arguments that look like them.
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

APP=""; IDENTITY="${AURORA_SIGN_IDENTITY:-}"; PROFILE="${AURORA_NOTARY_PROFILE:-}"
OUT="notarize-out"; ENTITLEMENTS="$ROOT/app/mac/Aurora.entitlements"; DRY=0

die() { echo "sign-notarize: $*" >&2; exit 1; }

# Secret-looking material is refused wherever it appears (arguments or the
# env-supplied names): key files, PEM blocks, key-ID/issuer-ID shapes, long tokens.
refuse_secret() {
  case "$1" in
    *.p8|*.p12|*.pem|*.pfx|*.key|*.mobileprovision|*"-----BEGIN"*)
      die "refusing '$1': looks like key material. Store it in the keychain with 'xcrun notarytool store-credentials' and pass the profile name instead." ;;
  esac
  if printf '%s' "$1" | grep -Eq '^[0-9A-Fa-f]{8}-([0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}$|^[A-Za-z0-9+/=_-]{32,}$'; then
    die "refusing an argument that looks like a key ID, issuer ID or token. Only names are accepted."
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --identity)         [ $# -ge 2 ] || die "--identity needs a value"; IDENTITY="$2"; shift 2 ;;
    --keychain-profile) [ $# -ge 2 ] || die "--keychain-profile needs a value"; PROFILE="$2"; shift 2 ;;
    --out)              [ $# -ge 2 ] || die "--out needs a value"; OUT="$2"; shift 2 ;;
    --entitlements)     [ $# -ge 2 ] || die "--entitlements needs a value"; ENTITLEMENTS="$2"; shift 2 ;;
    --dry-run)          DRY=1; shift ;;
    -h|--help)          sed -n '2,24p' "$0"; exit 0 ;;
    --key*|--issuer*|--apple-id|--password|--team-id) die "$1 is not accepted: credentials never go on the command line (see --help)" ;;
    -*)                 die "unknown option: $1" ;;
    *)                  [ -z "$APP" ] || die "more than one app given"; APP="$1"; shift ;;
  esac
done

for v in "$IDENTITY" "$PROFILE"; do [ -z "$v" ] || refuse_secret "$v"; done
[ -d "$APP/Contents/MacOS" ] || die "usage: $0 <Aurora.app> --identity NAME --keychain-profile NAME [--out DIR] [--dry-run]"
[ -n "$IDENTITY" ] || die "no signing identity (--identity or AURORA_SIGN_IDENTITY)"
[ -f "$ENTITLEMENTS" ] || die "no such entitlements file: $ENTITLEMENTS"

if [ "$IDENTITY" = "-" ]; then
  [ "$DRY" = 1 ] || { echo "sign-notarize: ad-hoc identity '-' cannot be notarized; running as --dry-run"; DRY=1; }
else
  security find-identity -v -p codesigning | grep -qF "\"$IDENTITY\"" \
    || die "identity not found in the keychain: $IDENTITY (see: security find-identity -v -p codesigning)"
fi
[ "$DRY" = 1 ] || [ -n "$PROFILE" ] || die "no notarytool keychain profile (--keychain-profile or AURORA_NOTARY_PROFILE)"

VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")"
WORK="$OUT/Aurora.app"
mkdir -p "$OUT"; rm -rf "$WORK"
echo "==> copying $APP -> $WORK"
ditto "$APP" "$WORK"

echo "==> bundling dylibs + licenses, signing inside-out as \"$IDENTITY\""
"$HERE/bundle-dylibs.sh" "$WORK" --identity "$IDENTITY" --entitlements "$ENTITLEMENTS"

echo "==> verifying the bundle"
"$HERE/verify-bundle.sh" "$WORK"

ZIP="$OUT/Aurora-$VERSION.zip"
echo "==> zipping for submission: $ZIP"
ditto -c -k --keepParent "$WORK" "$ZIP"

if [ "$DRY" = 1 ]; then
  echo "==> DRY RUN: stopping before notarization. Would run:"
  echo "    xcrun notarytool submit \"$ZIP\" --keychain-profile \"${PROFILE:-<profile>}\" --wait"
  echo "    xcrun stapler staple \"$WORK\" && xcrun stapler validate \"$WORK\""
  echo "    spctl --assess --type execute -vv \"$WORK\""
  echo "    ditto -c -k --keepParent \"$WORK\" \"$OUT/Aurora-$VERSION-notarized.zip\""
  exit 0
fi

echo "==> submitting to Apple's notary service (this waits)"
RESULT="$OUT/notary-result.json"
xcrun notarytool submit "$ZIP" --keychain-profile "$PROFILE" --wait --output-format json > "$RESULT" || true
STATUS="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("status",""))' "$RESULT" 2>/dev/null || true)"
SUBID="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("id",""))' "$RESULT" 2>/dev/null || true)"
if [ "$STATUS" != "Accepted" ]; then
  echo "notarization status: ${STATUS:-unknown}" >&2
  [ -z "$SUBID" ] || xcrun notarytool log "$SUBID" --keychain-profile "$PROFILE" >&2 || true
  die "not accepted (details above; raw result: $RESULT)"
fi

echo "==> stapling"
xcrun stapler staple "$WORK"
xcrun stapler validate "$WORK"

echo "==> Gatekeeper + signature checks"
spctl --assess --type execute -vv "$WORK"
codesign --verify --strict --verbose=2 "$WORK"

FINAL="$OUT/Aurora-$VERSION-notarized.zip"
ditto -c -k --keepParent "$WORK" "$FINAL"
echo "done: $FINAL"
