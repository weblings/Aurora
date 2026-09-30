# MacCertPrep: hardened-runtime test and bundling feasibility (2026-09-29)

Closed `Aurora-qy5.1`. Opened epic `Aurora-qy5` (labels MacCertPrep, 1.0.4; blocks `Aurora-8mk.10`) with children qy5.2-qy5.7 chained: qy5.2 entitlements -> qy5.6 bundle dylibs -> qy5.3 bundle hygiene -> qy5.7 licenses -> qy5.4 sign-notarize script -> qy5.5 CMake identity. Apple Developer enrollment is pending verification, so everything here ran ad-hoc on scratchpad copies of `build/mac-app` (nothing in the repo changed but beads and `.gitignore`).

## Findings

- Ad-hoc + `--options runtime` fails at launch: dyld "code signature ... not valid for use in process: mapping process and mapped file (non-platform) have different Team IDs". The binary links Homebrew dylibs (`/opt/homebrew/opt/...`, ad-hoc, no Team ID) rather than bundling them. `com.apple.security.cs.disable-library-validation` makes it launch and serve the WebUI.
- Capture passes under the hardened runtime with only that entitlement: `activeInputName=mac` gave near-black per-zone-different frames on a dark screen and R 0.08 -> 0.34-0.53 (G/B ~0.13-0.22) under a red window. Also the first time the 4-zone map was seen working on Mac (`dummy` is uniform).
- Bundling (option 1) is feasible: transitive closure is 29 dylibs from 17 Homebrew packages, ~40 MB (app ~46 MB). A ~30-line script (copy, `install_name_tool -id/-change` to `@rpath`, add rpath `@executable_path/../Frameworks`, sign each) launched, but see the correction below: it never used the bundle. Bundled dylibs are still rejected with ad-hoc signing (no Team ID): only a real Developer ID shared by app + dylibs makes library validation pass, so the no-entitlement result is unproven until the cert exists (qy5.6). Static linking (option 2) rejected for now: Homebrew ships dynamic libs, so it means source builds of OpenCV/aubio and the codec chain.
- Licenses: Aurora is GPL-3.0-or-later; deps are mixed, not all GPL-3 (aubio and the gcc runtime are; OpenCV/openssl/mbedtls/tbb Apache-2.0; brotli/libomp MIT; ogg/vorbis/opus/openblas BSD; sndfile/lame/mpg123 LGPL; flac mixed; zstd BSD-or-GPL2, use BSD), all compatible with GPL-3+ distribution. From Homebrew metadata, not a legal review. Filed as qy5.7.
- Homebrew `cask` vs release zip: a downloaded zip is quarantined either way, so Gatekeeper applies; a source-building formula avoids notarization, a cask does not.
- `.gitignore` now covers `*.p8 *.p12 *.pfx *.cer *.certSigningRequest *.mobileprovision *.keychain*`.

## Surprises / dead ends

- First capture attempt stalled silently: TCC attributed the Screen Recording request to VS Code (the responsible process), which lacked the permission; frames stopped, no crash. Passed once VS Code was granted it.
- Two `Aurora-*.ips` crash reports in DiagnosticReports were from my own earlier expected-failure launches (21:13, 21:23), not the stalled run; matched by timestamp/pid before blaming them.
- `Aurora --help` isn't a flag: the app just starts and blocks the shell (backgrounded test ate a 60s timeout).
- `bd create ... --silent | tail -1` captured a warning line, not the ID, and children failed to attach (one stray epic created, reused). Parse IDs with `grep -o 'Aurora-[a-z0-9.]*'`.

## Not verified

- No-entitlement launch with a shared Team ID (needs the cert); `notarytool`, stapling, Gatekeeper on a downloaded copy; bundling on a machine genuinely without Homebrew; arm64 only.

## Lessons filed

- `The hardened runtime rejects ad-hoc/other-team dylibs ("different Team IDs"), so a Homebrew-linked app cannot launch under it` (macos-gui.md)
- `Screen Recording is granted to the responsible process, not the binary; launched from an editor, a missing grant stalls capture with no error` (macos-gui.md)
- `Match a crash report's timestamp and pid to the run before treating it as the cause` (debugging-method.md)

## Correction and qy5.6 (bundling script)

- The prototype's "zero `/opt/homebrew` references" only checked direct install names. `DYLD_PRINT_LIBRARIES` (non-hardened copy; DYLD_* is stripped under the hardened runtime) showed it loaded 29 libs from Homebrew and 0 from `Contents/Frameworks`: the binary's absolute rpath `/opt/homebrew/lib` is searched before the bundled one, and several Homebrew dylibs carry absolute rpaths (`.../Cellar/...`, gcc dirs). Many deps are `@rpath/...` only, so a path-only rewrite never touches them.
- `Aurora-qy5.6` done: `tools/mac/bundle-dylibs.sh` resolves the closure through each lib's rpaths, deletes all rpaths and re-adds only the bundle-relative one, verifies, signs inside-out, and writes `Contents/Resources/bundled-dylibs.tsv` for qy5.7. Real numbers: 28 dylibs (not 29), 40 MB; 28 loaded from the bundle and 0 from Homebrew at runtime; hardened launch with `Aurora.entitlements` serves the WebUI; re-run is idempotent.
- `Aurora-qy5.6.1` (optional check) passed: the bundled app launches and serves under `sandbox-exec` denying reads of `/opt/homebrew`; the unbundled build fails in dyld under the same profile. `Aurora-qy5.6.2` done: `shellcheck` (installed via brew, 0.11.0) found 2 issues in the script (unquoted `$TS` in the codesign args, `ls | wc`), fixed, clean, re-verified end to end. Optional beads qy5.6.3-6.4 (Gatekeeper baseline, Personal Team no-entitlement launch) remain.
- qy5.6.1 detail: profile `(allow default)(deny file-read* (subpath "/opt/homebrew"))`; `ls /opt/homebrew/lib` under it gives "Operation not permitted", so the deny is real. Caveats: only Homebrew paths are hidden (not a clean Mac), `sandbox-exec` is deprecated, and only a launch plus one REST call was exercised (no capture run).
- Still open: no-entitlement launch with a shared Team ID (cert; optional qy5.6.4 via a free Personal Team cert), a genuinely Homebrew-free Mac (qy5.6.1 approximates it), arm64 only. Next ready in the chain: qy5.3, qy5.7.
- Lessons filed: `A dependency check that only reads install names doesn't prove what dyld loads` and `sandbox-exec with a deny profile proves a bundle is self-contained, and needs a negative control` (macos-gui.md). Not filed: the two shellcheck findings (unquoted flag-list variable, `ls | wc`) are generic shell hygiene.
