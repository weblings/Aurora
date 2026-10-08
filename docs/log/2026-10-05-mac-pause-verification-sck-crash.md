# Mac verification of pause/resume, kea and axoz; SCK teardown crash found and fixed (Aurora-eq7a)

Id: mac-pause-verification-sck-crash

2026-10-05. Mac-side pass on the beads that were Linux-verified only (3ddb, 5ipy.14, kea, axoz, k0sx), plus a crash found while testing. Labels `needs-mac` / `needs-windows` added to the beads that still need a machine; Aurora-pyo (Intel Mac) closed as out of scope. Dolt had drifted behind `.beads/issues.jsonl` (34 JSONL-only issues); `bd import` upserted it, nothing re-initialised.

## Verified on Mac (mac-app preset, ctest 60/60)

- API, via devstack `--fake-hue` with live SCK capture: `PUT /api/state` pause/resume idempotent both ways, bad body 400; bridge log `active -> inactive -> active`; SSE frames ~102 per 2s running, 0 paused, ~103 after resume. While paused: zones/monitors GET 200 with data, zone PUT 409 `paused`, config save and `/api/reload` stay paused, a `refreshRate` saved while paused applied on resume. CPU: video ~21%, paused 0.3%, audio (silent) 0.6%.
- `GET /api/state` flags on Mac: video true/zones true, audio true/zones false, `audioDevicesUrl` null (no sink picker); paused keeps pre-pause flags. Audio mode: sound gives ~50 frames/s, silence gives none (not checked whether intended).
- Owner, by hand: tray menu works, Pause/Resume label flips (also after a Dashboard-initiated change), recording indicator clears while paused and returns, pause then quit then reopen resumes, Dashboard button tooltips, axoz pending state.
- Web: all 16 node test scripts pass; CaptureSource fed Mac state shapes; the live app serves all 28 modules from `app.js`.
- Mode switch took ~0.05s on the fake bridge, not the ~4.5s in the axoz notes (those were real-bridge timings).

## Not verified

- Failed resume staying paused: the owner saw the tray and Dashboard button stay on Resume after revoking Screen Recording, but the CLI line they captured was the launch-time `Pipeline not started` message, so the resume path itself was not cleanly isolated; real Hue (k0sx, DTLS resume), Dashboard and Capture source screens in a browser by the agent (no browser tool), Windows build and screens.

## Findings

- A Screen Recording grant made while the app was running applied without relaunch (macOS 27, app launched from a terminal): Audio to Video then worked. The Mac denied text and `docs/lessons/input.md` say to quit and reopen; possibly too strict, unverified for an `open`-launched Aurora.app. Noted on Aurora-d3ec.
- A failed first build (permission denied at launch) is stderr-only; the WebUI shows nothing. Failed resume shows a fixed "Couldn't resume Aurora." and drops the server error; the tray only logs. Filed Aurora-d3ec (design: store build error in `PipelineHost`, expose on `/api/state`, render via `renderReloadError`; the first-request result is Denied, so no distinct Pending UX).
- Dashboard showed two messages for one failed switch (switch error plus audio banner) and the error flickered on click. Fixed in Aurora-tazx: banner yields to the switch error, error kept until a switch is confirmed or flags match its target (`isSwitchErrorStale`), target named in the text; tests mutation-checked, demo fork ported. Daemon-unreachable wording ("Couldn't" vs "Could not", two paths) filed as Aurora-jm6s.
- **SIGABRT in `-[AuroraSCKStreamOutput stream:didOutputSampleBuffer:ofType:]`** (three crash reports, 20:38, 21:47 and 22:00 on 2026-10-04): `std::mutex::lock()` threw on the sample queue. `output.impl` was a raw pointer to the grabber's `Impl`; a Video to Audio switch destroys the grabber and a still-running callback locked the freed mutex. Reproduced on demand by a stress loop (pause/resume plus rapid Video/Audio switches): death at iteration 125 (12s); the old build also died within two gentle 1s switches and once seconds after startup. Permissions were not involved (video granted, audio off). Fixed: `Impl` is `enable_shared_from_this`, held by the grabber and by the output (attached before `addStreamOutput`, copied locally in each callback); `stopStream`/`didStopWithError:` clear `output`/`stream` to break the cycle; `objc_precise_lifetime` guard in `didStopWithError:`. After the fix: 3,000+ iterations across seeds, no crash report, ctest 60/60, RSS flat (footprint ~125MB).
- Research (secondary sources): Apple documents nothing on callbacks after `stopCapture` or output/delegate lifetime; SCStream holds outputs weakly on Sonoma+; only AVCaptureSession documents a stop barrier. Do not treat the stop completion handler as one.
- `leaks` with MallocStackLogging: every leak with an allocator is `Aurora::Output::Hue::MbedTlsImpl::_initMembers()` / `_initRNG()`, ~6 blocks (~3.4KB) per output rebuild; none from SCK. Pre-existing, filed as Aurora-2pe5.

## Beads

Filed: Aurora-eq7a (crash, fixed in the working tree, acceptance run done), Aurora-d3ec, Aurora-tazx, Aurora-jm6s, Aurora-2pe5. Notes appended to 3ddb, kea, axoz, 5ipy.14, k0sx. 3ddb stays open for the Windows tray (5ipy.15); 5ipy.14 stays open for the failed-resume case.

## Lessons

- One filed in `docs/lessons/input.md`: an SCStream output with a raw pointer to the grabber crashes on teardown.
