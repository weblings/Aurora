# Multi-monitor lands (unverified on hardware); DevFrameDump gap traced to gj0.9's fix

Closed `Aurora-8mk.12` and `Aurora-8mk.6`, both `1.0.3`/`MacVideoTerminal`.

**`Aurora-8mk.12`** (`DevFrameDump` receiving no data on Mac, left open and
unresolved when `Aurora-8mk.5` landed) turned out to already be fixed --
just never linked back. `Aurora-gj0.9`'s close reason records the actual
root cause: `DevFrameDump`'s UDP size cap was set from IPv4's theoretical
65507-byte max, but macOS's real `net.inet.udp.maxdgram` is 9216 -- about
7x smaller -- so the 100x100 test frame (40051-byte encoded payload) was
silently dropped by `send()`. Fixed there by capping against the real
encoded payload size and lowering the limit to 9000
(`DevFrameDump.cpp:32`), verified with 5 paired samples across 4 zones at
exact 0.0000 delta between `validate.py frame`'s independent recomputation
and `DevLightTap`. Closed `8mk.12` with that cross-reference rather than
re-chasing it.

**`Aurora-8mk.6`** (multi-monitor `selectMonitor()`/
`hasCustomScreenManagement()`): checked prior art first, as the bead asked
-- `X11Grabber.cpp:119-125`'s `selectMonitor()` just resets its `XShmData`
and stores the new id, rebuilding lazily on the next
`grabFrameSubsample()`; `WindowsGrabber` does the same with its DXGI
duplication object. Ported the same shape to
`ScreenCaptureKitGrabber.mm`:

- `SCKMonitorData` (new `MonitorData` subclass, declared in
  `ScreenCaptureKitGrabber.hpp`) carries the display's `CGDirectDisplayID`
  -- stored as plain `uint32_t` (its actual underlying type) rather than
  pulling `CoreGraphics` into the header, keeping the PIMPL/plain-C++
  boundary the header's own comment calls out.
- `hasCustomScreenManagement()` → `true`; `selectMonitor()` stops the
  current `SCStream` (bounded wait, same shape as the destructor) and
  clears a `rebuildAttempted` flag; `grabFrameSubsample()` calls
  `_ensureStream()` first, which lazily rebuilds against the newly
  selected display's `CGDirectDisplayID` (re-fetching
  `SCShareableContent` to get a live `SCDisplay*`, falling back to
  whatever's first if the previously-selected display was unplugged).
- One deliberate deviation from the X11/Windows shape: `_ensureStream()`
  only attempts the rebuild once per `selectMonitor()` call, not every
  frame. X11's and Windows' per-frame retries are cheap local calls; Mac's
  is a genuine bounded async round trip (`SCShareableContent` fetch +
  `SCStream` start, up to 5s each), so retrying it every tick on a
  persistently-unreachable display would stall the processing loop
  repeatedly. A failed rebuild is caught and swallowed rather than thrown
  -- `Orchestrator::update()` calls `grabFrameSubsample()` with no
  surrounding try/catch, and `grabFrameSubsample()` already has no failure
  contract of its own, so throwing there was never safe. Persistent-failure
  signaling stays out of scope, deferred to `Aurora-8mk.9`'s `isHealthy()`
  work.
- Refactored the stream-setup code shared by first-start
  (`_initMonitorsList()`, which still throws on failure -- an expected,
  fail-fast startup contract) and the lazy rebuild (`_ensureStream()`,
  which must not throw) into one `configureAndStartStream()` helper that
  only writes to `Impl` once every step has actually succeeded, so a throw
  never leaves a half-built stream state behind.
- Added a hidden/manual Catch2 test (`input/mac/tests/MacInputTests.cpp`,
  `[manual][ScreenCaptureKitGrabber]`) that switches to the first
  non-primary monitor and checks for real frame data at the reported
  resolution, skipping cleanly when only one display is present -- same
  `[.]`-tagged, hardware-gated category as `WindowsGrabber`'s manual
  capture test.

Verified: `AuroraInputMac` (including the `.mm`) builds clean, all 3
existing automated tests in `build-input-mac-test` still pass unchanged.
Ran the new manual test on this machine (one display only) -- it correctly
skipped past the single-monitor guard, then hit the *other* known Mac
constraint (TCC denies `SCShareableContent` entirely for a bare non-`.app`
test binary, same as documented for `Aurora-8mk.4`), not a bug in the new
code.

**Not done**: real verification against a second physical display.
Closed `8mk.6` anyway, with that gap stated explicitly in the close
reason, rather than leaving it open indefinitely for a hardware
prerequisite this environment doesn't have -- if the actual switch turns
out to misbehave on real hardware, that's a bug against working code, not
unfinished work.

State: `Aurora-8mk.6`, `.12` closed. Epic `Aurora-8mk` now 9/12 (75%).
Remaining: `Aurora-8mk.8` (permission recovery flow), `Aurora-8mk.9`
(lock/sleep stream health), `Aurora-8mk.10` (Gatekeeper/notarization,
deferred on purpose, P3).
