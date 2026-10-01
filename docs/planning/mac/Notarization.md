# macOS Gatekeeper/notarization

Id: mac-notarization

Status: partly shipped 2026-09-30. Developer ID cert, sign/notarize/staple
script and a notarized, launch-verified Aurora 1.0.4 release zip
(`Aurora_Mac_v1.0.4.zip`, no `disable-library-validation`; macOS 27, Apple
silicon only) exist; nothing is published and there is no CI path yet. Detail:
`docs/log/2026-09-30-mac-notarized-release-1-0-4.md`,
`docs/log/2026-09-30-mac-developer-id-first-signing.md` and
`docs/log/2026-09-30-mac-cert-prep-bundle.md`. Release recipe: build
`build/mac-release` (`cmake --preset mac-app -B build/mac-release
-DCMAKE_OSX_DEPLOYMENT_TARGET=27`), run `tools/mac/sign-notarize.sh` with the
Developer ID name and `aurora-notary` profile, then rename the
`*-notarized.zip` to the release convention `Aurora_Mac_v<version>.zip`
(the name does not matter to Apple, only the contents). Aurora-8mk.10 (release
distribution) was dropped 2026-09-30, so publishing and CI signing (below) are
untracked. Still open beads: lower-target dylibs (Aurora-0ap), Intel (Aurora-pyo).

Gatekeeper only fires on files carrying the `com.apple.quarantine`
extended attribute, which is set by whatever app *wrote* a downloaded
file (Safari, Mail, AirDrop) — a binary built and run locally via `cmake
--build` never gets it, so nothing shipped so far triggers Gatekeeper at
all. It becomes relevant the moment a built artifact is zipped and handed
to a second person, or self-downloaded through a browser even once.

When that's needed: Apple Developer Program membership ($99/yr) for a
Developer ID Application certificate, `codesign --options runtime`,
`notarytool submit` (works for standalone CLI binaries, not just `.app`
bundles, but still needs an embedded `Info.plist`), then `stapler
staple`. For CI later, an App Store Connect API key (`.p8`) instead of a
personal Apple-ID password.

Worth doing sooner than "eventually" once picked up: a stable Developer
ID signature is also the fix for the ad-hoc-signature
re-prompt-per-rebuild annoyance
([[mac-permissions#ad-hoc-signing-re-prompts-every-rebuild]]), so it
solves both problems at once rather than two separately-deferred ones.
See also [[mac-tray-parity]]'s `Aurora-qps.6` — a free "Personal Team"
certificate may cover that phase's signing-stability needs without
reaching for the $99 Developer ID at all, which would leave this doc's
scope purely about eventual distribution, not dev-loop annoyance.

**Open:** publishing the notarized zip (where it lives, release notes,
version/tag flow) and an unattended signing path for CI (an App Store Connect
API key instead of the personal Apple ID; `sign-notarize.sh` deliberately
accepts only names and a keychain profile today). Both are release-process
decisions, not build work.
