# Mac cert prep: bundle hygiene, signing identity, licenses (2026-09-30)

Closed: Aurora-qy5.3, Aurora-qy5.4, Aurora-qy5.5, Aurora-qy5.7 (children of epic Aurora-qy5). Branch `chore/MacBundleHygiene` (8622e9d, 30a93c0, 7e0ec6a). Nothing needs a certificate; nothing was tested with one.

## Shipped

- qy5.3: `Info.plist.in` gains CFBundleInfoDictionaryVersion, CFBundleDevelopmentRegion, LSMinimumSystemVersion, LSApplicationCategoryType, NSHighResolutionCapable, NSHumanReadableCopyright. `mac-app` preset sets `CMAKE_OSX_DEPLOYMENT_TARGET=14.2` (process-tap floor); plist minimum comes from the same value. `tools/mac/verify-bundle.sh`: plist keys, every nested Mach-O signed/strict-verifiable, one identity, no Homebrew links, minos vs plist, licenses. Read-only, works on ad-hoc.
- qy5.5: `AURORA_MAC_SIGN_IDENTITY` cache var (default `-`, build unchanged). A name runs `bundle-dylibs.sh` (inside-out, hardened runtime, timestamp, entitlements, no `--deep`). Ad-hoc path now clears stale `Frameworks`. `bundle-dylibs.sh` shows codesign errors on failure and accepts absolute app paths.
- qy5.7: `tools/mac/bundle-licenses.sh` (run by `bundle-dylibs.sh` before signing) puts keg license files, Aurora's LICENSE, `THIRD-PARTY-NOTICES.txt` and `licenses.tsv` in `Contents/Resources/Licenses` for all 17 packages / 28 dylibs; `verify-bundle.sh` fails on any dylib without an entry.

- qy5.4: `tools/mac/sign-notarize.sh <app> --identity NAME --keychain-profile NAME [--out] [--entitlements] [--dry-run]`: copy app -> bundle-dylibs (sign inside-out) -> verify-bundle -> ditto zip -> `notarytool submit --wait` -> staple/validate -> spctl + codesign verify -> re-zip stapled app. Input bundle never modified. Both arguments are names (profile from `xcrun notarytool store-credentials`); identity/profile may come from AURORA_SIGN_IDENTITY / AURORA_NOTARY_PROFILE. Refuses `.p8/.p12/.pem`, PEM blocks, UUID- or token-shaped values and `--key*/--issuer*/--password/--apple-id/--team-id`. Ad-hoc `-` implies `--dry-run`.

## Verified

- Raw and bundled ad-hoc builds: verify-bundle PASS (user-run for qy5.3; mine for 5.5/5.7); AuroraAppMacTests pass; main binary minos 14.2.
- qy5.4: `bash -n` and shellcheck clean; ad-hoc dry run runs copy/bundle/sign/verify/zip and prints the notarytool/staple/spctl commands; each secret-shaped argument and env value refused; unknown identity reported; input bundle unchanged.
- Negative paths: nonexistent identity fails with "no identity found"; deleting a package's license makes verify-bundle FAIL.

## Not verified / open

- Real Developer ID signing and notarization, including everything after the dry-run line of sign-notarize.sh (`notarytool submit`, staple, spctl, the notary-log-on-failure path): written, never executed; the `disable-library-validation` entitlement stays until it is proven removable with one Team ID.
- Bundled dylibs need macOS 27 (27 of 28 report minos 27.0), so the bundle only runs on 27+ despite the 14.2 plist; follow-up bead filed under Aurora-qy5. verify-bundle prints a WARN.
- flac/gcc license applicability checked against the kegs' headers/READMEs, not upstream sites; not a legal review.
- qy5.5 was closed with `--force` (bd showed it blocked by qy5.4, the sign-notarize script, still open).

## Surprises

- Stale `Frameworks` after a failed/switched identity build produced a mixed bundle (caught by verify-bundle, fixed above).
- The gcc keg ships no GPLv3 text.
- Lessons: docs/lessons/macos-gui.md (deployment target/minos, stale bundle state, Homebrew license metadata), docs/lessons/debugging-method.md (swallowed codesign stderr).
