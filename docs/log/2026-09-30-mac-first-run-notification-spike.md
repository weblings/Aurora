# Mac first-run notification spike, dead end, NUX tip screen instead (2026-09-30)

Beads: Aurora-qps.5 (closed, superseded), Aurora-qps.6 (closed, dropped), Aurora-qps.8 (new, open: Mac-only NUX tip screen). Branch `feat/MacSupportV2`. No app code changed; probes were throwaway files in the session scratchpad.

## Question

Can Aurora send a one-shot first-run "running in the menu bar" notification on Mac (Windows' balloon analogue), once a real signing identity exists? The bead assumed the ad-hoc denial was caused by the signature.

## Probe results (fresh bundle ID each, UNUserNotificationCenter)

- Ad-hoc, `.provisional`: denied instantly (`Code=1 "Notifications are not allowed"`, `authorizationStatus` 0, no dialog). Control.
- Developer ID (Team ID set, hardened runtime, timestamped), `.provisional` and `.alert`; exec'd directly, via `open`, and double-clicked in Finder by the user: same instant denial, no dialog.
- Probe written to the conventional lifecycle (real NSApplicationDelegate, `[NSApp run]`, center delegate set first, request from `applicationDidFinishLaunching`), ad-hoc and Developer ID: same denial. So not a missing delegate or run loop.
- Developer ID `.alert` probe, notarized (Accepted) + stapled, copied to `~/Applications`, double-clicked: real permission request appeared; once enabled in System Settings > Notifications, `granted=1`, `authStatus=2`, post ok, `delivered count=1`. Notarization and location changed together; which one matters is unattributed. Provisional was not retested in the notarized setup.
- Online sources conflict: one issue says Developer ID plus a stapled ticket is needed (a proposal, untested, worded almost identically to the sentence our bead quoted as "independent research"); two write-ups say ad-hoc bundles can post and the grant keys on bundle ID. Apple's docs as found say nothing about notarization.

## Decision

Do not build the notification. It would fire once (sentinel `tray-balloon.seen`), needs a permission dialog (or, quiet/provisional, is invisible in Notification Center), and only works in a notarized build from an ordinary apps folder, so dev builds never show it. Instead a Mac-only NUX screen after Welcome plays `MacTray.gif` with menu-bar wording (Aurora-qps.8; plan and findings are on the bead: flow in `web/ui/app.js`, platform from `/api/capabilities`, GIF moves into `web/ui/`, server content-type table lacks `.gif`). qps.6 dropped: launch-at-login is out of scope.

## Also

- The user found Spotlight lists Aurora once it is in Applications; README now says to drag the app there. Signing was not shown to matter for that.
- The permission dialog was first mistaken for the probe app itself (it has no icon of its own and looks like a system prompt); the first answer was not Allow, which recorded a denial until re-enabled in Settings.
- The "Kerberos" entry with the generic icon in Settings > Notifications is an Apple system app, unrelated.

## Not verified

Provisional (quiet) delivery in a notarized build; whether notarization or install location is the gating factor; behavior on any macOS other than 27.0.1.

Lessons: docs/lessons/macos-gui.md (UserNotifications entry, amended), docs/lessons/debugging-method.md (two sources can be one claim).
