#!/bin/bash
# Bundle the Homebrew dylibs Aurora.app links against into Contents/Frameworks,
# make every reference bundle-relative, and re-sign inside-out (Aurora-qy5.6).
#
#   tools/mac/bundle-dylibs.sh build/mac-app/bin/Aurora.app
#       [--identity "Developer ID Application: Name (TEAMID)"]   default: - (ad-hoc)
#       [--entitlements app/mac/Aurora.entitlements]
#
# Nothing here is committed: the copies live only in the .app you point it at.
# The identity is a *name* (or "-"); no key, password or profile is read or
# written by this script. Idempotent: safe to re-run on an already bundled app.
#
# Why rpaths are rewritten, not just paths: the binary and many Homebrew dylibs
# carry absolute rpaths (/opt/homebrew/lib, .../Cellar/...). If those survive,
# `@rpath/libfoo.dylib` can quietly resolve to Homebrew instead of the bundle,
# and the app "works" here while being broken on any Mac without Homebrew.
set -eu

APP=""; IDENTITY="-"; ENTITLEMENTS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --identity) IDENTITY="$2"; shift 2 ;;
    --entitlements) ENTITLEMENTS="$2"; shift 2 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) APP="$1"; shift ;;
  esac
done
[ -d "$APP/Contents/MacOS" ] || { echo "usage: $0 <Aurora.app> [--identity ID] [--entitlements FILE]" >&2; exit 2; }
[ -z "$ENTITLEMENTS" ] || [ -f "$ENTITLEMENTS" ] || { echo "no such entitlements file: $ENTITLEMENTS" >&2; exit 2; }

APP_ABS="$(cd "$APP" && pwd)"   # absolute or relative APP both work (CMake passes an absolute path)
EXE="$APP/Contents/MacOS/$(defaults read "$APP_ABS/Contents/Info" CFBundleExecutable 2>/dev/null || echo Aurora)"
[ -f "$EXE" ] || EXE="$APP/Contents/MacOS/Aurora"
FW="$APP/Contents/Frameworks"
MANIFEST="$APP/Contents/Resources/bundled-dylibs.tsv"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
mkdir -p "$FW" "$APP/Contents/Resources"

int() { install_name_tool "$@" 2>/dev/null; }   # its "invalidates signature" warning is expected; we re-sign below
deps_of()   { otool -L "$1" | tail -n +2 | awk '{print $1}'; }
rpaths_of() { otool -l "$1" | awk '/cmd LC_RPATH/{getline; getline; print $2}'; }
is_system() { case "$1" in /System/*|/usr/lib/*) return 0;; esac; return 1; }

# resolve <dep> <original dir of the loader> <loader's rpaths...> -> real path on stdout
resolve() {
  dep="$1"; ldir="$2"; shift 2
  case "$dep" in
    /*) [ -e "$dep" ] && { python3 -c 'import os,sys;print(os.path.realpath(sys.argv[1]))' "$dep"; return 0; } ;;
    @loader_path/*) c="$ldir/${dep#@loader_path/}"
      [ -e "$c" ] && { python3 -c 'import os,sys;print(os.path.realpath(sys.argv[1]))' "$c"; return 0; } ;;
    @rpath/*) n="${dep#@rpath/}"
      for r in "$@" /opt/homebrew/lib; do
        case "$r" in @loader_path*) r="$ldir${r#@loader_path}";; @executable_path*) continue;; esac
        [ -e "$r/$n" ] && { python3 -c 'import os,sys;print(os.path.realpath(sys.argv[1]))' "$r/$n"; return 0; }
      done
      for c in /opt/homebrew/opt/*/lib/"$n"; do   # last resort: any keg's lib dir
        [ -e "$c" ] && { python3 -c 'import os,sys;print(os.path.realpath(sys.argv[1]))' "$c"; return 0; }
      done ;;
  esac
  return 1
}

# queue lines: <file in bundle>|<original file it was copied from (or itself)>
: > "$WORK/queue"; : > "$WORK/seen"; : > "$WORK/map"
echo "$EXE|$EXE" >> "$WORK/queue"
for f in "$FW"/*.dylib; do [ -e "$f" ] && echo "$f|$f" >> "$WORK/queue"; done

while [ -s "$WORK/queue" ]; do
  line="$(head -n 1 "$WORK/queue")"; sed -i '' 1d "$WORK/queue"
  file="${line%%|*}"; orig="${line#*|}"
  grep -qxF "$file" "$WORK/seen" && continue; echo "$file" >> "$WORK/seen"
  ldir="$(dirname "$orig")"; rp=(); while IFS= read -r r; do [ -n "$r" ] && rp+=("$r"); done < <(rpaths_of "$orig")
  for dep in $(deps_of "$file"); do
    is_system "$dep" && continue
    [ "$dep" = "@rpath/$(basename "$file")" ] && continue
    name="$(basename "$dep")"
    if [ -e "$FW/$name" ]; then continue; fi            # already bundled (idempotent re-run)
    src="$(resolve "$dep" "$ldir" ${rp[@]+"${rp[@]}"})" || { echo "ERROR: cannot resolve $dep (needed by $file)" >&2; exit 1; }
    prev="$(awk -F'\t' -v n="$name" '$1==n{print $2}' "$WORK/map")"
    [ -z "$prev" ] || [ "$prev" = "$src" ] || { echo "ERROR: name clash $name: $prev vs $src" >&2; exit 1; }
    cp "$src" "$FW/$name"; chmod u+w "$FW/$name"
    printf '%s\t%s\n' "$name" "$src" >> "$WORK/map"
    echo "$FW/$name|$src" >> "$WORK/queue"
  done
done
# manifest = closure (name, source); merged with any previous run's
{ [ -f "$MANIFEST" ] && cat "$MANIFEST"; cat "$WORK/map"; } | sort -u > "$WORK/m2" && mv "$WORK/m2" "$MANIFEST"

# rewrite every bundled file: ids, dependency paths, rpaths
fix() {
  f="$1"; mode="$2"
  for r in $(rpaths_of "$f"); do int -delete_rpath "$r" "$f" 2>/dev/null || true; done
  if [ "$mode" = exe ]; then int -add_rpath "@executable_path/../Frameworks" "$f"
  else int -id "@rpath/$(basename "$f")" "$f"; int -add_rpath "@loader_path" "$f"; fi
  for dep in $(deps_of "$f"); do
    is_system "$dep" && continue
    new="@rpath/$(basename "$dep")"
    [ "$dep" = "$new" ] || int -change "$dep" "$new" "$f"
  done
}
fix "$EXE" exe
for f in "$FW"/*.dylib; do fix "$f" lib; done

# verify: no Homebrew/absolute leftovers, every @rpath dep present in Frameworks
bad=0
for f in "$EXE" "$FW"/*.dylib; do
  for dep in $(deps_of "$f"); do
    is_system "$dep" && continue
    case "$dep" in
      @rpath/*) [ "$dep" = "@rpath/$(basename "$f")" ] || [ -e "$FW/${dep#@rpath/}" ] || { echo "MISSING $dep (from $f)"; bad=1; } ;;
      *) echo "LEFTOVER $dep (in $f)"; bad=1 ;;
    esac
  done
  for r in $(rpaths_of "$f"); do
    case "$r" in @executable_path/../Frameworks|@loader_path) ;; *) echo "STRAY RPATH $r (in $f)"; bad=1 ;; esac
  done
done
[ "$bad" = 0 ] || { echo "verification failed" >&2; exit 1; }

# license texts go in before signing -- adding files afterwards would break the seal
"$(dirname "$0")/bundle-licenses.sh" "$APP"

# sign inside-out: dylibs first, then the app (install_name_tool invalidated the old signature)
if [ "$IDENTITY" = "-" ]; then TS=(--timestamp=none); else TS=(--timestamp); fi
sign() { codesign "$@" >/dev/null 2>"$WORK/cs.err" || { echo "codesign failed:" >&2; cat "$WORK/cs.err" >&2; exit 1; }; }
for f in "$FW"/*.dylib; do sign --force --options runtime "${TS[@]}" --sign "$IDENTITY" "$f"; done
ARGS=(--force --options runtime "${TS[@]}" --sign "$IDENTITY"); [ -z "$ENTITLEMENTS" ] || ARGS+=(--entitlements "$ENTITLEMENTS")
sign "${ARGS[@]}" "$APP"
codesign --verify --strict "$APP"
echo "bundled $(find "$FW" -name '*.dylib' | wc -l | tr -d ' ') dylibs into $FW ($(du -sh "$FW" | cut -f1)); manifest: $MANIFEST"
