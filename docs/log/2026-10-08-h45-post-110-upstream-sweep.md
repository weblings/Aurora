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

## Lessons

- Build-toolchain: extended the huenicorn Mbed TLS entry with building
  3.6.7/4.2.0 from release tarballs and the dead-port DTLS driver.
- Language-cpp: deleter entry gains the huenicorn recurrence (4 structs on
  Mbed TLS 4, 6 on 3).
- Architecture/process (new): a fix in ported code is an upstream finding;
  grep the fork when closing the bead.

## Aurora-h45.19: refreshRate candidate confirmed (finding 12)

- Scratch driver built from huenicorn-fork `origin/develop` (`cfcaeb4`)
  sources: `PipewireGrabber.cpp`, `XdgDesktopPortal.cpp`, `Config.cpp`,
  `Credentials.cpp`, `ImageProcessing.cpp`, `Logger.cpp`, plus pkg-config
  libpipewire/gio/opencv4 and Aurora's `build/_deps` json/glm. It repeats
  `Runtime.cpp:87-88` with an empty config dir. No Mbed TLS needed.
- Reading private `m_pwData` needs `#define private public`, but only after
  pre-including every header `PipewireGrabber.hpp` pulls in. Defined first, it
  breaks libstdc++ (`<sstream>`, `<any>`: "redeclared with different access").
- Real portal on this box (Ubuntu 24.04, GNOME 46.0 Wayland, libpipewire
  1.0.5), owner picked a monitor: `max_framerate` `15729223/262144`,
  `framerate` `0/1`; `displayRefreshRate()` 15729223; `config.json` saved
  `"refreshRate": 15729223`.
- Effect in full huenicorn not run: from code, `fromHertz` gives a ~64 ns
  tick, so `LoopRegulator::sync()` never sleeps.
- Finding 12 added to [[upstream-findings]]. Fix filed as `Aurora-h45.20`;
  MR placement (likely MR 3) left to the owner.

## Aurora-h45.20: finding 12 fix branch (not tested in full huenicorn)

- `fix/reduce-max-framerate` off fork `origin/develop`:
  `displayRefreshRate()` returns `num / denom`, 0 when `denom == 0` (Aurora
  parity). In huenicorn a 0 becomes 1 Hz via `Config::setRefreshRate`'s clamp,
  noted in the finding for the MR.
- Verified with the h45.19 driver rebuilt on the branch, reusing the saved
  restore token (no picker prompt): same `15729223/262144`,
  `displayRefreshRate()` 60, saved `"refreshRate": 60`. `-Wall -Wextra`: 35
  warnings, all OpenCV headers, identical on `develop`.
- Owner chose not to run full huenicorn (build + fake or real bridge,
  ~1-2 h). The finding now marks the runtime effects as extrapolated from
  Aurora and from huenicorn's code, and lists the measurement method.
- Found while scoping that: huenicorn's loop logs an "interval exceeded"
  warning on every overrun, so the bogus rate likely floods stdout too.
- Owner decision: 12 joins MR 3. Committed `daade9f` on
  `fix/reduce-max-framerate`, cherry-picked as `ceaf5a6` onto
  `fix/capture-pipeline` after 4 (`git cherry` clean); both pushed. Driver
  rebuilt on the combined branch: 60, saved `"refreshRate": 60`. `h45.17`'s
  DMA-BUF port now lands after 12 on that branch.
