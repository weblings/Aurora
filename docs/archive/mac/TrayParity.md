# macOS tray-parity: open work

Id: mac-tray-parity

Status: shipped 2026-09-30 — Aurora-qps epic closed. qps.6 (SMAppService
spike) dropped, qps.5 (first-run notification) superseded by qps.8 (below).
Full build history (qps.1-.4, .7) is [[mac-tray-parity-history]]. Archived with
the epic close; kept as the record of the last tray-parity piece.

## Aurora-qps.8 — Mac-only NUX tip screen (shipped)

After Welcome, on Mac only (`platform` from `/api/capabilities`, now returned
by `probeState()`), `MacTrayTipScreen` shows `web/ui/icons/MacTray.gif` with
menu-bar wording; Continue goes to Output Connect, Back to Welcome, and Back
from Output Connect returns to the tip. Welcome's in-flight Hue discovery
promise is carried through, so discovery keeps running. First-run only
(inherits the `nuxCompleted` gate); Windows/Linux unchanged. Why not a
notification: it worked only for a notarized build run from an ordinary
apps folder, needs a permission dialog, and would fire once
(`docs/log/2026-09-30-mac-first-run-notification-spike.md`). Log:
`docs/log/2026-09-30-mac-nux-tray-tip.md`.

**Dropped:** qps.6 (launch-at-login is out of scope; Windows/Linux don't
ship it) and qps.5 (superseded above).

## Related, not part of this epic

`Aurora-zlw` — the tray context menu blocks the pipeline tick loop while
open (confirmed on both Mac and Windows; Linux is structurally immune,
its `TrayIcon` runs on its own worker thread). Deliberately low priority
(a menu is only open briefly), filed separately since the real fix is
architectural (moving the tick loop off the AppKit/Win32 main thread) and
cuts across platforms rather than being Mac-specific tray work.
