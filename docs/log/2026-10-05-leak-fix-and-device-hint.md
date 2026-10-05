# Aurora-2pe5 fixed, Aurora-36b7 and the 9swq copy done; d3ec still waits on its retry path

Id: leak-fix-and-device-hint

2026-10-05. Follow-on to [[error-text-and-leak-beads]]: the three small beads from that review were built. The 2pe5 fix was run on the Mac app (below); nothing else here has been run on the Mac app or in a browser yet.

## Done

- **Aurora-2pe5 (closed):** `MbedTlsDeleter` in `output/hue/src/MbedTlsImpl.hpp` now `delete`s each struct after its `*_free`. New `output/hue/tests/DtlsClientLeakTests.cpp` replaces global `operator new`/`delete` in the test executable with counting versions and runs 20 failed `DtlsClient::init()` calls (odd-length client key, so `_initSSL` throws after the six `new`s and before any handshake wait; no network). Before the fix: live-block delta 120 (20 x 6). After: 0, and all 48 hue cases pass. Mac `leaks(1)` on the test binary (`MallocStackLogging=1 leaks --atExit`) reported `MbedTlsImpl::_initRNG` root leaks against the unfixed header and 0 leaks against the fixed one. Mac end-to-end (mac-app, `devstack up --input dummy`, no Screen Recording involved): a loop of `PUT /api/state` pause then resume (each resume rebuilds the Hue output), polled with `leaks <pid>` between batches of 50. Unfixed build (binary of 2026-10-04): 716 -> 1023 -> 1314 leaks, about 6 blocks and 3.7KB per cycle, RSS 66MB -> 99MB. Rebuilt with the fix (`cmake --build build/mac-app`, 3s): 414 leaks / 19,872 bytes after 5 cycles and exactly the same after 205, RSS flat at 65.7MB, zero request errors. The 414 is the constant startup baseline. `leaks` without MallocStackLogging at launch gives counts, not allocators. Bead closed; ASan+LSan on Linux was not run (the counting test covers fails-before/passes-after on every platform).
- **Aurora-36b7 (code and tests done, bead left open, `needs-mac`):** `DeviceField` takes `showHint` (default true). `DashboardScreen._renderTopTier` passes `!topTierError && !toggleError`, so neither hint renders beside an error. The video and audio hints share `device-field-hint` (`min-height: 2lh` in `dashboard.css`) and the video copy is shorter (`Auto (primary display). A specific monitor can be chosen once Video connects.`), so a Video/Audio toggle should not move the content below. `DeviceField.test.mjs` covers the shared class and `showHint:false`. The same patch is applied to `web/demo/vendor/webui` (`DeviceField.js`, `DashboardScreen.js`, `dashboard.css`; the demo copies are older than `web/ui`, the patch applied with an offset). All `web/ui` and `web/demo` node tests pass.
- **Aurora-9swq item 3:** `ZoneMappingScreen.js:244` says "...it needs an active output and screen capture running." like the Dashboard. The demo fork has no Zone Mapping screen. Items 1 and 2 (Capture source screen on Mac and Windows, Mac `--fresh` first launch) still need a machine.

- **Aurora-9swq, Capture source copy (from the owner's Mac try):** with Screen Recording turned off while Audio was running, a switch to Video showed the Audio notes ("Zones react together in Audio mode...", "Uses your system's default audio device.") above the Screen Recording error. The screen follows the running pipeline (axoz), so Audio was still filled, which is intended; the pairing read as contradictory, and "per-zone mapping step" names a step a first-time user has not met. `ModeDeviceScreen._render` now says "In Audio mode, all your lights react to sound together." and hides that note and DeviceField's hint (`showHint: !this.error`) while an error shows, the 36b7 rule. New `web/ui/screens/ModeDeviceScreen.test.mjs` (note shown without error, hidden with one, no zone-mapping wording, Video never shows it; both gating mutants fail it). Demo fork: `web/demo/vendor/webui/screens/ModeDeviceScreen.js` is an older mode-based copy, so the same edit was applied by hand. Owner has not yet re-checked the refused switch in a browser.

## Closed on owner confirmation (Mac, by hand)

- **Aurora-36b7:** hint hidden under the permission error, no layout jump when toggling (Screen Recording off). Closed.
- **Aurora-axoz:** failure revert (outline removed, previous option stays filled, one error) seen with Screen Recording off; with the earlier pending-state checks on Mac and Windows and kea closed, nothing remained. Closed.
- **Aurora-9swq (Mac half):** Capture source in both modes, `--fresh` first launch connecting Video on landing, and the refused Audio to Video switch copy. `needs-mac` removed; Windows views still open.
- **Aurora-5ipy.14:** only the failed-resume-stays-paused case remains (see Findings: needs an `open`-launched app).

## Not started

- **Aurora-d3ec:** step 4 (what the user can do after a startup failure) is still undecided; the recommended Retry button on `POST /api/reload` is not built. It touches `PipelineHost`, the three `app/*/src/main.cpp`, `GET /api/state` and the Dashboard.

## Findings

- `closure-check.mjs` in the demo vendor prints three STALE lines (`ZonePatchQueue.js`, `messages.js`, `topBar.js`). None of this change's files are among them; not investigated.
- The demo fork's `ModeDeviceScreen.js` still passes `mode:` and `showSinkField:` to a flag-based `DeviceField` (vendored `DeviceField.js` has the new constructor), so its Audio view probably shows the monitor picker. Not investigated; belongs to the re-vendor (Aurora-ifkn).
- `2lh` is the only thing keeping two lines reserved: if the video hint wraps to three lines at very narrow widths the layout would still shift. Unchecked in a browser.

- **Terminal-launched stack runs under the terminal's grant.** `tccutil reset ScreenCapture com.aurora.app` succeeded, yet `devstack up` still captured the real display. Denied-state checks need `Aurora.app` launched on its own (lesson extended).
- **`devstack`'s first tab shows the NUX; a refresh shows the Dashboard.** An earlier version of this entry (and the skill) wrongly said `devstack` never shows the NUX; the owner saw it open on the NUX. `nuxCompleted: true` is set over REST after launch (checked via `GET /api/config`), but `app.js` `bootstrap()` reads it once, so the tab opened at launch has already entered the NUX. Refreshing it goes to the Dashboard (owner-verified). Consequence: Capture source can be reached through that first tab, but `activeInputName`/`activeOutputNames` are already set by then, so it does not reproduce a first launch's connect-Video-on-landing; that still wants a hand-launched `Aurora.app --fresh`. The app opens that tab itself: `app/mac/src/main.cpp` sets `isFirstSetup = !exists(configRoot/config.json)` and calls `openWebBrowser(url)` right after the WebUI binds when it is true (otherwise it only prints a clickable link); `--fresh` wipes the root, so every `devstack up` is a first setup. (Read from the Mac main only; the Linux and Windows mains not checked.)
- `--fresh` is an empty temp config root and `--fake-hue` the fake-bridge defaults; the zone map is copied in by `devstack.py` after launch, not by either flag.
- **A stray hand-launched Aurora on 8215 broke `devstack up`** with a frame timeout; the cause was `Could not bind WebUI` in `app.log`. Quit it (it was the owner's, with their go-ahead) and the stack came up.
- **Owner observation, unrecorded until now and not verified here:** after granting Screen Recording mid-session, Aurora recovered on Video/Audio switches without a restart. That contradicts the "quit and reopen" wording in the permission lesson and in d3ec's copy. Which launch (`open`ed `Aurora.app` or terminal) it was is unconfirmed; do not tighten d3ec's wording until it is reproduced on an `open`-launched app.
- **Mac loop details for 2pe5:** the `PUT /api/state` pause/resume loop needs no permission at all (`--input dummy`), so it is safe to run unattended.

## Lessons

- [debugging-method.md](../lessons/debugging-method.md): a leak regression test with no sanitizer (count live `operator new` blocks in the test exe; `leaks --atExit` on a filtered test binary; prove the check on the unfixed source).
- [macos-gui.md](../lessons/macos-gui.md): the responsible-process lesson extended (a terminal-launched stack ignores `tccutil reset` on Aurora's own bundle id).
- [debugging-method.md](../lessons/debugging-method.md): a fail-soft port bind surfaces as a frame timeout (second entry this session).
- [components.md](../lessons/components.md): hide a screen's state notes while a switch error shows.
- [language-cpp.md](../lessons/language-cpp.md): the `unique_ptr` deleter lesson now records the confirmation instead of "confirm there".
