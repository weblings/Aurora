# macOS tray-parity: open work

Id: mac-tray-parity

Status: active — Aurora-qps epic. qps.6 (SMAppService spike) dropped and
qps.5 (first-run notification) superseded by qps.8 (open). Full build history
(qps.1-.4, .7) is [[mac-tray-parity-history]]; this doc only tracks what's
still open.

## Aurora-qps.8 — Mac-only NUX tip screen (open)

Replaces the first-run notification: after Welcome, on Mac only, show
`MacTray.gif` (moving into `web/ui/`) with Mac-specific wording; Continue
proceeds. Findings and file-level plan are on the bead. Why not a
notification: it worked only for a notarized build run from an ordinary
apps folder, needs a permission dialog, and would fire once
(`docs/log/2026-09-30-mac-first-run-notification-spike.md`).

**Dropped:** qps.6 (launch-at-login is out of scope; Windows/Linux don't
ship it) and qps.5 (superseded above).

## Related, not part of this epic

`Aurora-zlw` — the tray context menu blocks the pipeline tick loop while
open (confirmed on both Mac and Windows; Linux is structurally immune,
its `TrayIcon` runs on its own worker thread). Deliberately low priority
(a menu is only open briefly), filed separately since the real fix is
architectural (moving the tick loop off the AppKit/Win32 main thread) and
cuts across platforms rather than being Mac-specific tray work.
