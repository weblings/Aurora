# Aurora-2pe5 fixed, Aurora-36b7 and the 9swq copy done; d3ec still waits on its retry path

Id: leak-fix-and-device-hint

2026-10-05. Follow-on to [[error-text-and-leak-beads]]: the three small beads from that review were built. The 2pe5 fix was run on the Mac app (below); nothing else here has been run on the Mac app or in a browser yet.

## Done

- **Aurora-2pe5 (closed):** `MbedTlsDeleter` in `output/hue/src/MbedTlsImpl.hpp` now `delete`s each struct after its `*_free`. New `output/hue/tests/DtlsClientLeakTests.cpp` replaces global `operator new`/`delete` in the test executable with counting versions and runs 20 failed `DtlsClient::init()` calls (odd-length client key, so `_initSSL` throws after the six `new`s and before any handshake wait; no network). Before the fix: live-block delta 120 (20 x 6). After: 0, and all 48 hue cases pass. Mac `leaks(1)` on the test binary (`MallocStackLogging=1 leaks --atExit`) reported `MbedTlsImpl::_initRNG` root leaks against the unfixed header and 0 leaks against the fixed one. Mac end-to-end (mac-app, `devstack up --input dummy`, no Screen Recording involved): a loop of `PUT /api/state` pause then resume (each resume rebuilds the Hue output), polled with `leaks <pid>` between batches of 50. Unfixed build (binary of 2026-10-04): 716 -> 1023 -> 1314 leaks, about 6 blocks and 3.7KB per cycle, RSS 66MB -> 99MB. Rebuilt with the fix (`cmake --build build/mac-app`, 3s): 414 leaks / 19,872 bytes after 5 cycles and exactly the same after 205, RSS flat at 65.7MB, zero request errors. The 414 is the constant startup baseline. `leaks` without MallocStackLogging at launch gives counts, not allocators. Bead closed; ASan+LSan on Linux was not run (the counting test covers fails-before/passes-after on every platform).
- **Aurora-36b7 (code and tests done, bead left open, `needs-mac`):** `DeviceField` takes `showHint` (default true). `DashboardScreen._renderTopTier` passes `!topTierError && !toggleError`, so neither hint renders beside an error. The video and audio hints share `device-field-hint` (`min-height: 2lh` in `dashboard.css`) and the video copy is shorter (`Auto (primary display). A specific monitor can be chosen once Video connects.`), so a Video/Audio toggle should not move the content below. `DeviceField.test.mjs` covers the shared class and `showHint:false`. The same patch is applied to `web/demo/vendor/webui` (`DeviceField.js`, `DashboardScreen.js`, `dashboard.css`; the demo copies are older than `web/ui`, the patch applied with an offset). All `web/ui` and `web/demo` node tests pass.
- **Aurora-9swq item 3:** `ZoneMappingScreen.js:244` says "...it needs an active output and screen capture running." like the Dashboard. The demo fork has no Zone Mapping screen. Items 1 and 2 (Capture source screen on Mac and Windows, Mac `--fresh` first launch) still need a machine.

## Not started

- **Aurora-d3ec:** step 4 (what the user can do after a startup failure) is still undecided; the recommended Retry button on `POST /api/reload` is not built. It touches `PipelineHost`, the three `app/*/src/main.cpp`, `GET /api/state` and the Dashboard.

## Findings

- `closure-check.mjs` in the demo vendor prints three STALE lines (`ZonePatchQueue.js`, `messages.js`, `topBar.js`). None of this change's files are among them; not investigated.
- `2lh` is the only thing keeping two lines reserved: if the video hint wraps to three lines at very narrow widths the layout would still shift. Unchecked in a browser.

## Lessons

- [debugging-method.md](../lessons/debugging-method.md): a leak regression test with no sanitizer (count live `operator new` blocks in the test exe; `leaks --atExit` on a filtered test binary; prove the check on the unfixed source).
- [language-cpp.md](../lessons/language-cpp.md): the `unique_ptr` deleter lesson now records the confirmation instead of "confirm there".
