# Permission recovery flow lands, verified live through a real deny/grant cycle

Closed `Aurora-8mk.8` (`1.0.3`/`MacVideoTerminal`).

Re-checked the three pieces the design doc called for before writing any
code, since two turned out to already be done. (1) Bounded wait +
structured non-hanging response: `ScreenCaptureKitGrabber`'s
`SCShareableContent` fetch was already bounded (5s, from `Aurora-8mk.5`),
and `PipelineHost::reload()`/`Pipeline::build()` already caught exceptions
gracefully and returned a `reloadError` string rather than hanging or
crashing -- that whole shape came over unchanged when `app/mac/main.cpp`
was ported from `app/linux`, before this Mac work even started. (2) the
`platform` field -- already done, `Aurora-8mk.7`. The one real gap was (3):
a permission-shaped failure was indistinguishable from any other reload
error, so the WebUI could only ever show the raw exception sentence, never
a distinct "here's how to fix it" state.

Scoping decision, discussed with the user rather than assumed: making this
properly structured (a JSON error *code*, matching Hue pairing's
`{"error":"link_button_not_pressed"}` precedent) would mean widening
`core/Runtime/SettingsRoutes.hpp`'s `onConfigChanged` contract, which is
shared with `app/linux`/`app/windows` -- neither buildable or testable from
this macOS-only environment. Went with the narrower option instead: a new
`Aurora::Input::Mac::PermissionError` (kind `Pending`/`Denied`) thrown from
the two permission-shaped `SCShareableContent` failures in
`ScreenCaptureKitGrabber.mm`, caught in `app/mac/main.cpp`'s
`PipelineHost::reload()` and turned into a stable `"permission_denied: "`/
`"permission_pending: "` string prefix on `errorOut` -- Mac-owned code
only, zero changes to the shared contract or the other two platforms.

New `web/ui/MacPermissionRecovery.js` parses that prefix (only when
`platform === 'mac'`, from `/api/capabilities`) and renders a distinct
block -- explanation, a `x-apple.systempreferences:` deep link to the
Screen Recording pane, quit+relaunch instructions -- instead of the
generic "couldn't apply it live: <message>" sentence. Wired into both
`ModeDeviceScreen.js` and `DashboardScreen.js`'s reload-error paths (the
two places a mode/device change can trigger this); each screen's
assignment site checks for the prefix before deciding whether to apply its
own "Saved, but..."/"Couldn't apply it live..." framing, so the guided
block gets the raw, unframed message and everything else is unaffected.

Verified live, not just compiled -- the user ran the actual Mac hardware
side while this session drove the daemon:

- Spun up `tools/fake-hue-bridge` + env-var credential seeding
  (`AURORA_HUE_USERNAME`/`_CLIENTKEY`/`_ENTERTAINMENT_CONFIG_ID`) to get a
  real output registered without a manual pairing flow, then `open --env
  ... bin/Aurora.app --args --fresh` (discovered `open --env` here --
  needed since `open`'s normal env handling doesn't reach the launched
  process the way a direct exec would).
- `PUT /api/config {activeInputName: mac}` against a never-granted bundle
  identity: `reloadError` came back `"permission_denied: ..."` in
  35-200ms, nowhere near the 5s bound. Fired concurrently with an unrelated
  `GET /api/capabilities`: that GET completed in under 1ms, confirming the
  failing reload doesn't starve the connection pool.
- Mid-session, the user was prompted by two *separate* real system
  dialogs: the Screen Recording grant itself, and (after that succeeded)
  the second "bypass the system picker" consent gate `Aurora-8mk.5`'s log
  already documented -- both expected, neither a surprise once the prior
  log was checked.
- First grant+relaunch cycle still came back denied -- reproduced
  `docs/MacSupport.md`'s documented gotcha live: an ad-hoc-signed dev
  binary's TCC identity changes on every rebuild, so a grant made against
  an older build doesn't carry over. `tccutil reset ScreenCapture
  com.aurora.app` (the doc's own prescribed escape hatch) confirmed this --
  it found a real, resettable entry despite the fresh binary still reading
  as denied. After the reset and one more full quit+relaunch with a fresh
  dialog answered, the same PUT succeeded with no `reloadError`, and `GET
  /api/monitors` returned the real display (1710x1107, Retina-scaled) --
  recovery confirmed end to end, not just "should work."

All 62 `app/mac` tests and 3 `input/mac` tests still pass.

Two lessons filed in `docs/lessons/input.md`: an ad-hoc-signed dev
binary's Screen Recording grant doesn't survive a rebuild even for the
same bundle identifier (`tccutil reset` confirms a stale, non-matching
entry rather than "never granted" -- cost the first grant/relaunch retest
here), and `SCShareableContent`'s completion handler resolved as denied in
under a second rather than hanging while the dialog was pending, so the
`Pending` timeout path may be closer to theoretical than the common case.

State: `Aurora-8mk.8` closed. Epic `Aurora-8mk` now 10/12 (83%). Remaining:
`Aurora-8mk.9` (lock/sleep stream health -- needs the user to actually lock
the screen mid-stream, an empirical step only they can do), `Aurora-8mk.10`
(Gatekeeper/notarization, deferred on purpose, P3).
