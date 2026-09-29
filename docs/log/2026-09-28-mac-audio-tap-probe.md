# Audio process-tap probe: capture mechanism confirmed, permission signal stays opaque

Ran `Aurora-9z4.1` (Step 0 of `Aurora-9z4`, Mac audio-terminal support).
Built a throwaway Objective-C++ probe
(`initStereoGlobalTapButExcludeProcesses` → `AudioHardwareCreateProcessTap`
→ an aggregate device wrapping the tap with a real output device as
`kAudioAggregateDeviceMainSubDeviceKey` → `AudioDeviceCreateIOProcID`),
wrapped as a real `.app` bundle (`AudioProbe.app`,
`com.aurora.audioprobe`), ad-hoc signed, mirroring `Aurora-8mk.4`/`.11`'s
already-proven bundle shape.

## Capture mechanism: confirmed working, first try

The concrete API dictionary shape scoped into [[mac-audio]] from
research (tap UID in `kAudioAggregateDeviceTapListKey`, real output UID as
both the aggregate's main sub-device and its one sub-device,
`kAudioAggregateDeviceIsPrivateKey: true`) compiled and worked exactly as
designed, with no iteration needed on the Core Audio call sequence itself.
Two runs, both against real system audio:

- Bare exec from Terminal: 1879 IOProc callbacks over 20s, **100% non-zero**
  from the very first callback (`t=1s`).
- `open`-launched from the real `AudioProbe.app` bundle (LaunchServices
  launch, fresh never-before-run identity): 1875 callbacks, again **100%
  non-zero from the first callback**, no delay, no zero-buffer window at
  all.

No aggregate-device misconfiguration (the "tap-only, no sub-device" trap
research flagged) was hit — the dictionary shape worked as documented on
the first attempt.

## Permission signal: could not get a clean read, even hands-on

This is the part Step 0 was actually most riskly targeting, and it did
**not** resolve cleanly — worth recording as a real limitation, not a
negative result to paper over:

- The user (present at the keyboard, since I can't see the screen or click
  dialogs) reported a dialog appeared during **both** runs, but couldn't
  identify which permission either one was for.
- Despite that, both runs still delivered full audio with zero delay.
- `AudioProbe` never appeared as its own entry in System Settings →
  Privacy & Security → Screen & System Audio Recording afterward — only
  `Terminal` and `Aurora` were listed, both plausibly pre-existing from
  earlier video-track testing, not confirmed new from this session.

**Most likely explanation, not fully certain:** this is consistent with
`Aurora-8mk.8`'s already-known finding for ScreenCaptureKit — *the OS
surfaces a permission dialog asynchronously, on its own schedule, without
gating the API call that triggers it*. If the same holds for
`AudioDeviceStart`, both dialogs could have appeared **after** capture had
already started successfully, explaining why data flowed immediately
regardless of whether or when the user answered. This would generalize a
video-only lesson to a second Apple capture API, which is itself worth
recording, but wasn't confirmed with certainty here — the user couldn't
attribute either dialog, so an alternative explanation (e.g. this specific
global, all-processes tap shape isn't gated the same way a per-app tap
would be, or Terminal already held a standing grant from unrelated prior
use) can't be ruled out either.

**Practical implication for `Aurora-9z4.4` (permission-recovery design):**
the already-scoped conclusion holds, now for a stronger reason than
before — not just "there's no public API to check the grant," but "even a
human watching the screen in real time couldn't reliably attribute the
dialogs that did appear." Designing Step 3 around an explicit
completion-handler-style signal was already ruled out; this session adds
that manual/visual observation isn't a reliable fallback either. The
zero-buffer-over-time-window inference approach already scoped is the
right call, not a reach for a cleaner signal that doesn't seem to exist.

## Not attempted

A `tccutil reset` on the specific TCC service for this permission (to force
a clean denied→granted cycle and observe the transition unambiguously)
would likely give a cleaner signal, but wasn't run this session — it would
revoke Terminal's already-working grant on the user's real dev machine, a
disruptive, hard-to-reverse-without-their-help action taken without
confirming they wanted that trade-off first. Left as a follow-up if a
cleaner signal is ever actually needed before shipping, rather than a gap
in this probe.

## State

`Aurora-9z4.1` closed — the capture mechanism it exists to de-risk is
confirmed working. `Aurora-9z4.2` (CMake plumbing) is now the epic's ready
item. `Aurora-9z4.4` (permission-recovery design) remains blocked on
nothing new — its design direction is unchanged, just more confidently
scoped now.
