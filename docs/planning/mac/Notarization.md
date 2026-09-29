# macOS Gatekeeper/notarization

Id: mac-notarization

Status: deferred, not started (Aurora-8mk.10). Not needed for anything
shipped so far — [[mac-video-capture]] and [[mac-audio]] are both
terminal-only, single-machine builds today.

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

**Open:** signing/notarization cost and workflow for eventual release
zips — deferred, but worth flagging early since it affects the release
distribution story, not just the build. No bead work has started on this
beyond the scoping above.
