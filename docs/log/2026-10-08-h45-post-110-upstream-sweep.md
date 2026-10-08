# Aurora-h45: post-1.1.0 sweep for more huenicorn upstream candidates

Id: h45-post-110-upstream-sweep

2026-10-08. Read closed and open beads and logs since [[h45-upstream-fix-branches]]
and checked each Aurora fix against huenicorn-fork `origin/develop` (`cfcaeb4`)
for the same bug in huenicorn's own code. No code changed.

## Filed

- `Aurora-h45.18` (from `Aurora-2pe5`): confirmed present. `MbedTlsDeleter`
  in `MbedTlsClient3Impl.hpp:43` and `MbedTlsClient4Impl.hpp:44` only calls
  `FreeFunc(ptr)`; the six structs `new`'d in `_initMembers`/`_initRNG` are
  never deleted. Leaks on every `Streamer` build (`Runtime.cpp:225`).
- `Aurora-h45.19` (from `Aurora-k7p`): likely, unverified. `displayRefreshRate()`
  returns raw `max_framerate.num` (`PipewireGrabber.cpp:103`); `Runtime.cpp:87-88`
  persists it on first run, and it caps the UI's max. huenicorn's framerate
  offer equals Aurora's (25/1, 0/1, 1000/1), so only the producer's reply
  decides. Bead runs huenicorn's own grabber TUs against the real portal here
  (GNOME 46.0 Wayland, libpipewire 1.0.5).

## Considered, not filed

- Discovery 1s timeout (`Aurora-07i`): same in `CurlClient.cpp:68`; Aurora's
  live first-click check never ran, so evidence is thin.
- TLS verification off (`Aurora-70gs`): same in `CurlClient.cpp:72-73`; issue
  material only, Aurora has no fix yet.
- Unbounded portal waits (`Aurora-1z9`): 5/9/10 already fix the hangs; a bound
  is a design choice.
- DTLS retry budget (`Aurora-vf1.3`): unmeasured hypothesis.
- `_initCapture` busy-wait (`PipewireGrabber.cpp:331`): present, impact unmeasured.
- Fullscreen freeze (`Aurora-1t1`): already `Aurora-h45.17`.

## Aurora-h45.18: finding 11 fixed on the fork

- Branch `fix/mbedtls-deleter-leak` off fork `origin/develop`: `delete ptr;`
  replaces the dead `ptr = nullptr;` in both `MbedTlsClient3Impl.hpp` and
  `MbedTlsClient4Impl.hpp`. Staged, not committed or pushed.
- huenicorn `#error`s on Mbed TLS 2.28 (this box's system copy), so 3.6.7 and
  4.2.0 were built from release tarballs into the scratchpad. JSON/glm headers
  came from Aurora's `build/_deps`, as in `tools/huenicorn-checks`.
- Driver: real `DtlsClient` + `Credentials` + `Logger` TUs, dead UDP port
  127.0.0.1:9, `handshakeAttempts = 1`, ASan+LSan, 3 cycles. `develop`: 18
  leaks / 8652 B on 3.6.7 (5 per cycle from `_initMembers`, 1 from `_initRNG`),
  12 / 6684 B on 4.2.0. Fixed: no leaks, no ASan errors on either.
  `DtlsClient.cpp` compiles with zero `-Wall -Wextra` warnings on both.
- Owner decision: 11 joins MR 1 (`fix/hue-api-robustness`, cherry-picked
  after 7 and 8). The heads-up issue is not edited: the maintainer said they
  would get back to it later, and gets the update then.
- Committed `9744ad4` on `fix/mbedtls-deleter-leak` and cherry-picked as
  `8d1e658` onto `fix/hue-api-robustness` (now 7, 8, 11; `git cherry` clean).
  Both pushed to the fork's `origin`. LSan driver re-run on the group branch:
  no leaks on 3.6.7 or 4.2.0.
