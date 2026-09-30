#!/bin/bash
# Check Aurora.app is in the shape notarization expects (Aurora-qy5.3):
# Info.plist keys, every nested Mach-O signed and strict-verifiable with the
# hardened runtime, one signing identity throughout, no --deep signature
# structure surprises, and the declared minimum macOS agreeing with what the
# binaries were actually built for.
#
#   tools/mac/verify-bundle.sh build/mac-app/bin/Aurora.app
#
# Read-only: never modifies the bundle, reads no key or profile. Works on an
# ad-hoc build (nothing here needs a certificate). Exit 1 on any FAIL; WARN
# lines are known gaps that don't fail the run.
set -u

APP="${1:-}"
[ -d "$APP/Contents" ] || { echo "usage: $0 <Aurora.app>" >&2; exit 2; }
PLIST="$APP/Contents/Info.plist"
fail=0
ok()   { echo "ok    $*"; }
bad()  { echo "FAIL  $*"; fail=1; }
warn() { echo "WARN  $*"; }

# ---- Info.plist -----------------------------------------------------------
plutil -lint "$PLIST" >/dev/null 2>&1 && ok "Info.plist is valid" || bad "Info.plist does not lint"
pl() { /usr/libexec/PlistBuddy -c "Print :$1" "$PLIST" 2>/dev/null; }
for key in CFBundleIdentifier CFBundleExecutable CFBundleName CFBundlePackageType \
           CFBundleShortVersionString CFBundleVersion CFBundleInfoDictionaryVersion \
           LSMinimumSystemVersion; do
  v="$(pl "$key")"
  [ -n "$v" ] && ok "$key = $v" || bad "Info.plist missing $key"
done
[ "$(pl CFBundlePackageType)" = "APPL" ] || bad "CFBundlePackageType is not APPL"
[ -f "$APP/Contents/MacOS/$(pl CFBundleExecutable)" ] || bad "CFBundleExecutable names a file that isn't in Contents/MacOS"
icon="$(pl CFBundleIconFile)"
[ -z "$icon" ] || [ -f "$APP/Contents/Resources/$icon" ] || bad "CFBundleIconFile $icon not in Resources"

# ---- nested code ----------------------------------------------------------
# Every Mach-O anywhere in the bundle, not just Frameworks/*.dylib: a helper
# tool or a stray .so would fail notarization if it were left unsigned.
machos="$(find "$APP" -type f ! -path '*/_CodeSignature/*' -print0 \
  | xargs -0 file | awk -F: '/Mach-O/{print $1}' \
  | sed 's/ (for architecture .*)$//' | sort -u)"
n="$(printf '%s\n' "$machos" | grep -c .)"
echo "      $n Mach-O file(s):"
main_exe="$APP/Contents/MacOS/$(pl CFBundleExecutable)"
ids=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  rel="${f#$APP/}"
  if ! codesign --verify --strict "$f" >/dev/null 2>&1; then bad "$rel: signature missing or invalid"; continue; fi
  info="$(codesign -dvv "$f" 2>&1)"
  ident="$(printf '%s\n' "$info" | awk -F= '/^Authority=/{print $2; exit}')"; [ -n "$ident" ] || ident="ad-hoc"
  case "$info" in *"flags="*runtime*) ;;
    *) if [ "$ident" = ad-hoc ]; then warn "$rel: hardened runtime flag not set (a plain CMake build; bundle-dylibs.sh sets it)"
       else bad "$rel: hardened runtime flag not set"; fi ;;
  esac
  ids="$ids
$ident"
done <<< "$machos"
nids="$(printf '%s\n' "$ids" | grep -c . | tr -d ' ')"
distinct="$(printf '%s\n' "$ids" | grep . | sort -u)"
[ "$(printf '%s\n' "$distinct" | grep -c .)" -le 1 ] \
  && ok "all $nids nested Mach-O files signed with the same identity (${distinct:-none})" \
  || bad "mixed signing identities: $(printf '%s' "$distinct" | tr '\n' ';')"

# Inside-out: a bundle-level strict verify only passes if every nested item
# was signed before the app was (sealed resources would mismatch otherwise).
codesign --verify --strict --verbose=1 "$APP" >/dev/null 2>&1 \
  && ok "codesign --verify --strict passes on the bundle" || bad "codesign --verify --strict fails on the bundle"

# Load-bearing for Developer ID: Frameworks dylibs must be plain files that
# our signature covers, not symlinks into Homebrew.
if [ -d "$APP/Contents/Frameworks" ]; then
  find "$APP/Contents/Frameworks" -type l | grep -q . && bad "symlinks in Contents/Frameworks"
  if otool -L $machos 2>/dev/null | grep -q -E '/opt/homebrew|/usr/local/(opt|Cellar|lib)'; then
    bad "a binary still links against Homebrew (run tools/mac/bundle-dylibs.sh)"
  else ok "no Homebrew link references"; fi
else
  warn "no Contents/Frameworks: dylibs not bundled (tools/mac/bundle-dylibs.sh, Aurora-qy5.6); links to Homebrew would fail on a machine without it"
  otool -L $machos 2>/dev/null | grep -q -E '/opt/homebrew' && warn "binary links against /opt/homebrew"
fi

# ---- licenses -------------------------------------------------------------
# Every bundled dylib needs its license text in the bundle (Aurora-qy5.7):
# GPL/LGPL/Apache/BSD all require it to travel with the binary.
LIC="$APP/Contents/Resources/Licenses"
if ls "$APP/Contents/Frameworks/"*.dylib >/dev/null 2>&1; then
  lic_bad=0
  [ -f "$LIC/Aurora/LICENSE" ] || { bad "Licenses/Aurora/LICENSE missing"; lic_bad=1; }
  [ -f "$LIC/THIRD-PARTY-NOTICES.txt" ] || { bad "Licenses/THIRD-PARTY-NOTICES.txt missing"; lic_bad=1; }
  for d in "$APP/Contents/Frameworks/"*.dylib; do
    n="$(basename "$d")"
    pkg="$(awk -F'\t' -v n="$n" '$1==n{print $2}' "$LIC/licenses.tsv" 2>/dev/null)"
    if [ -z "$pkg" ]; then bad "$n has no license entry (run tools/mac/bundle-licenses.sh)"; lic_bad=1
    elif ! ls "$LIC/$pkg/"* >/dev/null 2>&1; then bad "$n -> $pkg: no license file in Licenses/$pkg"; lic_bad=1; fi
  done
  [ "$lic_bad" = 0 ] && ok "every bundled dylib has a license text in Contents/Resources/Licenses"
fi

# ---- minimum OS -----------------------------------------------------------
declared="$(pl LSMinimumSystemVersion)"
maxmin="0"
while IFS= read -r f; do
  [ -n "$f" ] || continue
  m="$(vtool -show-build "$f" 2>/dev/null | awk '/minos/{print $2; exit}')"
  [ -n "$m" ] || continue
  [ "$(printf '%s\n%s\n' "$m" "$maxmin" | sort -V | tail -1)" = "$m" ] && maxmin="$m"
done <<< "$machos"
main_min="$(vtool -show-build "$main_exe" 2>/dev/null | awk '/minos/{print $2; exit}')"
if [ -n "$declared" ] && [ -n "$main_min" ]; then
  [ "$main_min" = "$declared" ] || [ "$(printf '%s\n%s\n' "$main_min" "$declared" | sort -V | tail -1)" = "$declared" ] \
    && ok "main binary minos $main_min <= LSMinimumSystemVersion $declared" \
    || bad "main binary needs macOS $main_min but Info.plist declares $declared"
fi
if [ "$maxmin" != "0" ] && [ -n "$declared" ] && [ "$(printf '%s\n%s\n' "$maxmin" "$declared" | sort -V | tail -1)" != "$declared" ]; then
  warn "bundle needs macOS $maxmin (highest minos of any Mach-O) but Info.plist declares $declared: it will not launch on macOS $declared..$maxmin. Bundled Homebrew dylibs are built for the host OS."
fi

[ "$fail" = 0 ] && echo "PASS" || echo "FAILED"
exit "$fail"
