# Stream health lands: lock doesn't freeze Aurora, but it does eventually kill the stream silently -- until now

Closed `Aurora-8mk.9` (`1.0.3`/`MacVideoTerminal`). Epic `Aurora-8mk` now
11/12 (91%) -- only `Aurora-8mk.10` (Gatekeeper/notarization, deferred on
purpose) remains.

Instrumented `ScreenCaptureKitGrabber.mm` temporarily (a per-callback gap
timer plus reading `SCStreamFrameInfoStatus` off the sample buffer's
attachments, `didStopWithError:` logging whatever `NSError` it got) rather
than guessing, per the bead's own instruction. Findings, with the user
locking their real machine while this session drove the daemon:

- Locking does **not** freeze or crash the app. `SCStream` keeps calling
  `didOutputSampleBuffer:` on schedule, just tagging every frame
  `SCFrameStatusIdle` (1) instead of `.complete` (0) -- confirmed live, not
  assumed from Apple's docs.
- Only after an extended lock does macOS actually tear the stream down:
  after 78 consecutive idle-status callbacks in the first observation
  (duration uncertain -- the watching shell command exceeded its own 120s
  timeout and was backgrounded before this fired, so the real threshold is
  "more than a minute or two," not pinned exactly), `didStopWithError:`
  fired with a genuine `NSError`: `"Failed to find any displays or windows
  to capture."` Two follow-up attempts at 30-40s and "at least a minute"
  did *not* reproduce it -- confirms the threshold is real and longer than
  that, not instant.
- Before this bead, nothing reacted to that stop. `m_impl->stream`/
  `output` kept pointing at the now-dead objects, so `_ensureStream()`
  (`Aurora-8mk.6`'s lazy-rebuild path) saw `stream != nil` and never
  attempted a rebuild -- `grabFrameSubsample()` would have silently served
  one frozen frame forever, with nothing anywhere signaling a problem.

Fix, reusing existing machinery rather than building a new reconnect
subsystem: added `IVideoInput::isHealthy()` (default `true`, so
Linux/Windows -- which have nothing analogous to this teardown -- are
unaffected by it existing at all). `ScreenCaptureKitGrabber`'s
`didStopWithError:` now clears `stream`/`output`/`rebuildAttempted` and
sets a new `healthy = false`, all under `frameMutex` -- extended to guard
this state too, not just `latestFrame`, since the delegate callback runs on
its own dispatch queue independent of every other thread that touches
`Impl`. Clearing those fields makes the very next `grabFrameSubsample()`
reuse `Aurora-8mk.6`'s existing lazy-rebuild path exactly as if
`selectMonitor()` had just torn the stream down -- no separate reconnect
code needed, it self-heals once the display is available again.
`Orchestrator::update()` (shared, platform-agnostic code) now skips a tick
entirely while `!m_input.isHealthy()`, rather than re-pushing a stale frame
to every output.

Verification split into what was and wasn't directly forced live: a real
`didStopWithError:` invocation (triggered incidentally by a pipeline-rebuild
race during an `activeMonitorName` change, with the same "Failed to find
any displays" error as the lock case) confirmed the handler itself runs
clean -- no crash, no hang, state cleared correctly under the mutex. The
actual same-instance stream-nil-to-rebuild recovery wasn't forced live
(would need another multi-minute real lock, impractical to keep
reproducing on request) -- accepted on code-review confidence instead,
since it calls the identical `configureAndStartStream()` that succeeded
cleanly across every one of today's many relaunches. Same category of
accepted gap as `Aurora-8mk.6`'s own close (hardware-limited, stated
explicitly rather than glossed over).

All 62 `app/mac` and 70 core `Aurora-Core` tests still pass.

State: `Aurora-8mk.9` closed. `Aurora-8mk` epic 11/12 (91%) -- only
`Aurora-8mk.10` (Gatekeeper/notarization) remains, deferred until a build
needs to leave this machine.
