# macOS tray-parity: open work

Id: mac-tray-parity

Status: active — Aurora-qps epic, 5/7 children closed. Full build history
(qps.1-.4, .7) is [[mac-tray-parity-history]]; this doc only tracks what's
still open.

## Aurora-qps.6 — free Personal Team signing spike (SMAppService feasibility)

Deliberately low priority and not blocking anything else: neither Windows
nor Linux ship launch-at-login today (Linux's XDG-autostart equivalent,
Aurora-lx4.1, is still open; Windows has no bead for it at all), so Mac
doing `SMAppService` now would leapfrog both shipped platforms rather than
catch up to them. Kept open only to resolve the signing question raised
in the 2026-09-28 investigation, not because it's scoped for near-term
work.

Research found ad-hoc signing is genuinely unreliable for `SMAppService`
(no stable designated requirement across rebuilds), but a completely free
Apple ID "Personal Team" in Xcode gets a real, stable, Team-ID-backed
certificate — per Apple DTS/TN3127 guidance, this is the documented fix
for "unstable code identity" problems, and doesn't require the $99
Developer Program. The commonly-cited 7-day Personal Team
provisioning-profile expiry looks like it doesn't apply here: macOS only
needs a provisioning profile for *restricted* entitlements, and Aurora's
mac target has none — so the certificate's own ~1-year validity likely
governs instead, same order of magnitude free or paid. Unconfirmed
empirically for this app specifically. The $99 Developer ID remains
relevant only for notarization/distribution ([[mac-notarization]]), not
for this.

**Next step, not yet done:** install full Xcode (not just the CLT), sign
in with an Apple ID for the free Personal Team "Apple Development" cert,
re-sign the bundle with it instead of ad-hoc. Confirm `codesign -d -r-`
(designated requirement) is identical across two separate rebuilds — the
actual test of "stable identity," not just "did it sign." Then attempt
`SMAppService.mainApp.register()` and a real (non-provisional)
notification. Log out and back in (not just relaunch — login items need
an actual login event) to confirm Aurora actually starts. Check System
Settings → Login Items shows an accurate entry, watching for the
`.notFound`-despite-registered status gotcha found in research.

## Aurora-qps.5 — first-run discoverability (UNUserNotificationCenter, Windows-balloon analog)

Blocked on `Aurora-qps.6` landing a stable Personal Team (or Developer
ID) signing identity — [[mac-tray-parity-history]] has the full spike
that found this dependency (a categorical block on ad-hoc-signed apps
ever obtaining `UserNotifications` authorization, not a rebuild-instability
risk a reset works around).

**Next step, not yet done:** once `qps.6` lands a stable identity, re-run
the same spike (`requestAuthorizationWithOptions:UNAuthorizationOptionProvisional`
on a fresh bundle id, check granted/error, confirm via
`getDeliveredNotificationsWithCompletionHandler` rather than asking a
human to look) against a properly-signed bundle first, to confirm the
identity is what actually unblocks it before writing any real `TrayIcon.mm`
code. Only once confirmed: implement the sentinel-gated first-run
notification (mirroring Windows' `x2o.3` "tray-balloon.seen"
sentinel-in-config-root pattern), decide provisional (silent) vs. full
alert (needs a visible dialog acceptance) once signing is sorted.

## Related, not part of this epic

`Aurora-zlw` — the tray context menu blocks the pipeline tick loop while
open (confirmed on both Mac and Windows; Linux is structurally immune,
its `TrayIcon` runs on its own worker thread). Deliberately low priority
(a menu is only open briefly), filed separately since the real fix is
architectural (moving the tick loop off the AppKit/Win32 main thread) and
cuts across platforms rather than being Mac-specific tray work.
