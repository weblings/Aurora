#!/bin/bash
# Ship the license texts for every dylib bundled into Aurora.app (Aurora-qy5.7).
#
#   tools/mac/bundle-licenses.sh build/mac-app/bin/Aurora.app
#
# Reads the closure bundle-dylibs.sh recorded (Contents/Resources/bundled-dylibs.tsv),
# maps each dylib to its Homebrew keg, and writes into the bundle only:
#   Contents/Resources/Licenses/<package>/<LICENSE|COPYING*|NOTICE*...>  (from the keg)
#   Contents/Resources/Licenses/Aurora/LICENSE                            (GPL-3.0-or-later)
#   Contents/Resources/Licenses/THIRD-PARTY-NOTICES.txt                   (generated index)
#   Contents/Resources/Licenses/licenses.tsv                              (dylib -> package, for verify-bundle.sh)
# Nothing third-party is committed; the closure list is the bundler's own, so the
# two cannot drift. Fails if a dylib maps to no keg or a keg has no license file.
# Must run before the bundle is signed (bundle-dylibs.sh calls it for that reason);
# Homebrew metadata is a starting point, not a legal review.
set -eu

APP="${1:-}"
[ -d "$APP/Contents/Resources" ] || { echo "usage: $0 <Aurora.app>" >&2; exit 2; }
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MANIFEST="$APP/Contents/Resources/bundled-dylibs.tsv"
[ -f "$MANIFEST" ] || { echo "no $MANIFEST: run tools/mac/bundle-dylibs.sh first" >&2; exit 1; }
[ -f "$ROOT/LICENSE" ] || { echo "no $ROOT/LICENSE" >&2; exit 1; }
command -v brew >/dev/null || { echo "brew not found (needed for license metadata)" >&2; exit 1; }

LIC="$APP/Contents/Resources/Licenses"
rm -rf "$LIC"; mkdir -p "$LIC/Aurora"
cp "$ROOT/LICENSE" "$LIC/Aurora/LICENSE"

export APP ROOT MANIFEST LIC
python3 - <<'PY'
import glob, json, os, re, shutil, subprocess, sys

APP, ROOT, MANIFEST, LIC = (os.environ[k] for k in ("APP", "ROOT", "MANIFEST", "LIC"))

# dylib -> keg
lib_keg = {}
for line in open(MANIFEST):
    name, src = line.rstrip("\n").split("\t")
    m = re.match(r"(/opt/homebrew/Cellar/([^/]+)/[^/]+)/", src)
    if not m:
        sys.exit(f"ERROR: {name} came from {src}, not a Homebrew keg; no license mapping")
    lib_keg[name] = (m.group(2), m.group(1))
pkgs = sorted({p for p, _ in lib_keg.values()})

meta = {f["name"]: f for f in json.loads(subprocess.check_output(
    ["brew", "info", "--json=v2", *pkgs], text=True))["formulae"]}

# Which license applies to the *bundled* libraries where Homebrew's string is an
# aggregate over everything in the package. Checked against the shipped headers
# (2026-09-30); re-verify when versions change.
APPLIES = {
    "flac": "libFLAC: Xiph.org BSD-style license (COPYING.Xiph); the GPL/LGPL files cover FLAC's programs and other libraries",
    "zstd": "BSD-3-Clause (the dual BSD/GPL-2.0 choice is taken as BSD)",
    "gcc":  "libgcc_s, libgfortran: GPL-3.0-or-later with the GCC Runtime Library Exception 3.1 (COPYING.RUNTIME; "
            "GPLv3 text: Aurora/LICENSE, the keg ships only GPLv2). libquadmath: LGPL (COPYING.LIB)",
}
PATTERNS = ("LICENSE*", "LICENCE*", "COPYING*", "COPYRIGHT*", "NOTICE*")

rows, missing = [], []
for pkg in pkgs:
    keg = next(k for p, k in lib_keg.values() if p == pkg)
    files = sorted({f for pat in PATTERNS for f in glob.glob(os.path.join(keg, pat)) if os.path.isfile(f)})
    if not files:
        missing.append(pkg); continue
    os.makedirs(os.path.join(LIC, pkg))
    for f in files:
        shutil.copy(f, os.path.join(LIC, pkg, os.path.basename(f)))
    libs = sorted(n for n, (p, _) in lib_keg.items() if p == pkg)
    rows.append((pkg, meta[pkg]["versions"]["stable"], meta[pkg]["license"], APPLIES.get(pkg),
                 meta[pkg]["homepage"], [os.path.basename(f) for f in files], libs))
if missing:
    sys.exit("ERROR: no license file in the keg for: " + ", ".join(missing))

try:
    remote = subprocess.check_output(["git", "-C", ROOT, "remote", "get-url", "origin"], text=True).strip()
    remote = re.sub(r"^git@github\.com:", "https://github.com/", remote).removesuffix(".git")
except Exception:
    remote = "(see the Aurora project page)"

with open(os.path.join(LIC, "THIRD-PARTY-NOTICES.txt"), "w") as out:
    out.write(f"""Aurora is licensed under the GNU General Public License, version 3 or (at your
option) any later version. The full text is in Aurora/LICENSE. Corresponding
source for Aurora: {remote}

This app bundles the shared libraries below in Contents/Frameworks, unmodified,
as Homebrew built them. Each package's license text(s), and any NOTICE file, are
in the folder of the same name. Libraries under the LGPL stay replaceable: they
are separate dylibs, so you may substitute your own build of the same library
version. Source for each is at its homepage and in the Homebrew formula of the
same name (https://github.com/Homebrew/homebrew-core).

""")
    for pkg, ver, lic, applies, home, files, libs in rows:
        out.write(f"{pkg} {ver}\n  license (Homebrew metadata): {lic}\n")
        if applies:
            out.write(f"  applies to what we bundle:   {applies}\n")
        out.write(f"  homepage:                    {home}\n  libraries:                   {', '.join(libs)}\n"
                  f"  license files:               {', '.join('Licenses/%s/%s' % (pkg, f) for f in files)}\n\n")

with open(os.path.join(LIC, "licenses.tsv"), "w") as out:
    for pkg, *_rest, libs in rows:
        for l in libs:
            out.write(f"{l}\t{pkg}\n")
print(f"licenses: {len(rows)} packages, {sum(len(r[-1]) for r in rows)} dylibs -> {LIC}")
PY
