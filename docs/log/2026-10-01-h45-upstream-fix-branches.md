# Aurora-h45: upstream fix branches for huenicorn — started

Id: h45-upstream-fix-branches

Started turning [[upstream-findings]] into one fix branch per finding in the
`../huenicorn-fork` sibling checkout (fork `master` == the commit the doc was
written against; branches cut from `origin/develop`, one commit ahead).
`Aurora-h45` became the epic; children `.1`–`.9` are the findings, `.10`
pushes and opens MRs.

## Re-verification pass

- All of 1–8 still present at the cited lines.
- **1 was wrong about why it's latent.** X11 and Pipewire tag `RGBA`/`RGB`,
  not `BGR`, while their bytes are blue-first. `mean()`'s hardcoded swap
  compensates. Honoring the tag alone would swap red/blue for real users, so
  `.1` now carries the grabber tag fixes and stacks on 3. Chain reordered to
  `.3` → `.1` → `.2` → `.4` → …
- **2's fix was dead code as written**: `Runtime.cpp`'s guard only admits `RGBA`.
- **5's fix (bare `return;`) would hang startup**: `PipewireGrabber` waits on
  an unbounded `fdReadyFuture`. Corrected to settle the promise first.
- **New finding 9**: the SelectSources denial branch has the same unsettled
  promise today.
- **New finding 10** (found during 5): D-Bus *call* errors in
  CreateSession, SelectSources and OpenPipeWireRemote also leave the promise
  unsettled. Reproduced with the fake portal returning an error. Bead
  `Aurora-h45.11`, sequenced after 9.
- **Aurora has the same bug**: its port carries 5/9 half-fixed and 10
  unfixed, so a denial or call error stalls the 60s bounded wait. Filed as
  `Aurora-p91`.

## Shipped

- `fix/propagate-pixel-format` (`ead673e`, not pushed): `rescale()` and
  `getSubImage()` copy `format` to their output. Closed `Aurora-h45.3`.
- `fix/mean-channel-order` (`2e9147e`, stacked on the above, not pushed):
  `mean()` picks red/blue by `format`; X11 tags `BGRA`/`BGR`; Pipewire tags
  negotiated `BGRx` as `BGRA`. Closed `Aurora-h45.1`. Until 2 lands, `BGRA`
  frames skip `Runtime`'s alpha drop (harmless: `mean()` ignores channel 3).
- `fix/bgra-alpha-drop` (`991be7e`, stacked on the above, not pushed):
  `Runtime`'s alpha-drop guard admits `BGRA`; `rgbaToRgb()` tags its output
  `RGB`/`BGR`. Closed `Aurora-h45.2`. Finding 2's premise was wrong:
  `COLOR_RGBA2RGB` is an OpenCV alias of `COLOR_BGRA2BGR`, so no new
  conversion was needed.
- `fix/divisors-half` (`c510d49`, off `origin/develop`, not pushed): `_divisors()` loops
  `i <= number / 2`. Measured impact is nil for common displays (see 4's
  write-up); kept as a contract fix. Closed `Aurora-h45.4`.
- `fix/portal-create-session-denied` (`c66f6ec`, off `origin/develop`, not pushed):
  `onCreateSessionResponseReceivedCallback` settles `fdReadyPromise` with
  `false` and returns on denial. Worse than the write-up said: on `develop`
  this denial segfaults (null session handle passed on as an object path).
  Closed `Aurora-h45.5`.
- `fix/portal-select-source-denied` (`269ecf1`, off `origin/develop`, not pushed):
  `onSelectSourceResponseReceivedCallback` settles `fdReadyPromise` with
  `false` before its existing return. Closed `Aurora-h45.6`.
- Pipewire also offers `RGB`/`YUY2`/`I420`, which the 4-byte decode can't
  handle. Not filed as a finding: screen-cast producers offer only 4-byte
  formats, so they never negotiate. Noted in 1's write-up for the MR instead.

## Verification

- The fork can't fully build here: `DtlsClient.cpp` needs Mbed TLS 3.x/4.x,
  the system has 2.28. The touched files build warning-free with `-k`
  (venv cmake, scratchpad build dir).
- Scratch driver against `ImageProcessing.cpp`: format preserved through both
  functions for all four `PixelFormat` values.
- Scratch driver mirroring `Runtime`'s per-frame path (rescale, alpha drop,
  crop, mean) on one color in all four layouts: all correct after 1; before
  it, true `RGBA` frames came out red/blue swapped. After 2, every layout
  reaches `mean()` as 3 channels with an `RGB`/`BGR` tag.
- 4: the real `_divisors()` body, extracted into a scratch driver, returns
  `{1,2,3,6}` for 6 and `{1,2,3,4,6,12}` for 12. A Python model of
  `subsampleResolutionCandidates()` compared old against new across 15
  resolutions.
- 5: fake ScreenCast portal (Python/Gio) on a `dbus-run-session` bus plus a
  driver copying `PipewireGrabber`'s constructor wait and `_stop()`. Denied
  CreateSession: `develop` segfaults, fixed build settles `false` and tears
  down cleanly. Denied SelectSources on the same build: promise unsettled
  after 5s, confirming 9 live.
- 9: same harness, denied SelectSources: `develop` unsettled after 5s,
  fixed build settles `false` and tears down cleanly.

## Lessons

- Processing: OpenCV's alpha-drop codes are aliases (`RGBA2RGB` == `BGRA2BGR`).
- Debugging method: a findings write-up's suggested fix is a hypothesis
  (1, 2 and 5 each had a wrong premise).
- Input: portal ScreenCast failure paths are testable offline with a fake
  portal on a private `dbus-run-session` bus.
- Input: extended the promise-settling entry with call errors (10) and the
  CreateSession-denial segfault.
- Input: extended the existing "trusting a tag" entry (huenicorn's X11
  mistag) with this recurrence instead of filing a duplicate.
- Input: every early return in a promise-driven portal callback chain must
  settle the promise.
- Build-toolchain: the huenicorn fork needs Mbed TLS 3.x/4.x; verify per-TU
  with `make -k`.
