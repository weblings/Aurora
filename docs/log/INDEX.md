# Build log index

Append-only record of closed and paused milestones. Every material fact lands
here — set-up, verification, surprises, dead ends — stated once and tightly.
Findings over narration: a paragraph where a line suffices is bloat wherever
it lives. A paused entry records where the work stands and what resumes it.
Planning docs stay clean: decisions, status, and pointers here only.

| Date | Milestone | Beads |
|---|---|---|
| 2026-09-13 | Phases 1–2 build history (core, plugins, app, Windows) | `bd list -l phase-1`, `bd list -l phase-2` |
| 2026-09-13 | Runtime follow-up: Orchestrator | `bd list -l phase-1` |
| 2026-09-13 | Hue follow-up: I/O layer | `bd list -l phase-1` |
| 2026-09-15 | WebUI 1stPass build order | `bd list -l phase-3` |
| 2026-09-20 | Docs-system overhaul (tags, skills, guards, split, beads, logs) | `bd list -l docs` |
| 2026-09-21 | Monorepo reorg (subtree merge, docs rename, status headers) | Aurora-2ay, Aurora-kwp, Aurora-jow, Aurora-jkl |
| 2026-09-21 | Public launch (audit, Pages deploy, branch incident) | Aurora-h7p, Aurora-fgw |
| 2026-09-21 | Ship-readiness overview (parity, brand, version, README, build) | Aurora-nl0, Aurora-k1q, Aurora-tnk, Aurora-9mq, Aurora-gv0, Aurora-qdk |
| 2026-09-21 | Demo UI 1.0.1 fixes (top-tier hide, slider centering) | Aurora-egp, Aurora-5jj |
| 2026-09-23 | Linux tray install (1.0.2, Exec baking, install hooks; tray render paused) | Aurora-lx4.2, Aurora-lx4.3, Aurora-qdk, Aurora-52o, Aurora-4mk |
| 2026-09-23 | Fake Hue bridge for bridgeless dev (tier-1 stub, dev routes, --fresh) | Aurora-rmq |
| 2026-09-23 | NUX black-screen triage (PipeWire fraction, tick starvation, tray terminate, Continue busy) | Aurora-k7p, Aurora-nzd, Aurora-cgr, Aurora-23a, Aurora-kwn, Aurora-4wi |
| 2026-09-23 | Tray bus-name race (own_name needs context pump, icon renders) | Aurora-4wi |
| 2026-09-23 | Windows headless dual-mode (LogSink, attach, rewire, flip; live pass green, closed) | Aurora-7l1 (+ 7l1.1-7l1.7) |
| 2026-09-24 | Light-viz relay: HueOutput tap + UDP-to-SSE bridge; Linux dry run + validate.py | Aurora-gj0.1, Aurora-gj0.2, Aurora-gj0.3, Aurora-1t1, Aurora-1z9, Aurora-u1u |
| 2026-09-24 | Light-viz relay: gj0.4 fixture + frame-dump hook + validate.py frame mode | Aurora-gj0.4, Aurora-gj0.9 |
| 2026-09-24 | Mac terminal tier-1 skeleton: CMake gating, input/mac, app/mac (paused on TCC probe) | Aurora-8mk.1, Aurora-8mk.2, Aurora-8mk.3, Aurora-8mk.7, Aurora-y1q |
| 2026-09-25 | gj0.5 refactor (3 slices) + gj0.6 viz page, browser-verified; demo footer 1.0.3 | Aurora-gj0.5, Aurora-gj0.6 |
| 2026-09-25 | --fake-hue flag + agent-run gj0.7 validation; viz docs end-to-end recipe | Aurora-gj0.7 |
| 2026-09-25 | TCC-identity probe resolved: Aurora.app bundle wrapper (+ icon) unblocks Mac track | Aurora-8mk.4, Aurora-8mk.11 |
| 2026-09-25 | ScreenCaptureKit grabber lands: real Mac capture, validated end to end via fake-hue+viz | Aurora-8mk.5, Aurora-8mk.12 |
| 2026-09-27 | Multi-monitor lands (unverified on hardware); DevFrameDump gap traced to gj0.9's fix | Aurora-8mk.6, Aurora-8mk.12 |
| 2026-09-27 | Permission recovery flow lands, verified live through a real deny/grant cycle | Aurora-8mk.8 |
| 2026-09-27 | Stream health lands: lock idles then kills the stream after ~1min+, isHealthy() self-heals via 8mk.6's rebuild | Aurora-8mk.9 |
| 2026-09-27 | Bundle icon fix: qlmanage flattened transparency + a real 32px export offset, switched to sips+corrected 1024px master | Aurora-8hh |
| 2026-09-28 | Audio process-tap probe: tap+aggregate-device+IOProc mechanism confirmed, permission signal stays opaque even hands-on | Aurora-9z4.1 |
| 2026-09-28 | MacAudioGrabber lands: CMake plumbing, real IAudioInput impl, tests -- verified end to end against real system audio | Aurora-9z4.2, Aurora-9z4.3, Aurora-9z4.6 |
| 2026-09-28 | Mac audio-terminal support ships: permission signal + app/mac wiring, verified end to end via fake-hue-bridge | Aurora-9z4.4, Aurora-9z4.5 |
| 2026-09-28 | WebUI banner for the audio permission signal, closes out Aurora-9z4 (7/7) -- browser rendering not verified, flagged | Aurora-9z4.7 |
| 2026-09-28 | --fake-hue ported to Mac/Windows, README tightened to name the actual env vars -- Windows not compile-verified, flagged | Aurora-zx4 |
| 2026-09-28 | Video<->audio handoff confirmed live; Screen Recording -3801 despite enabled toggle traced to a second, inline-Approve consent dialog | Aurora-z4q |
| 2026-09-28 | Docs archive + WebUI doc relocation + brand-asset move; check-links.sh's stale Analysis->docs base fixed (was silently checking nothing under docs/) | Aurora-0ki |
| 2026-09-28 | Docs archive follow-up: 6 more docs moved after edit-history check showed their exploratory Status: lines were stale, not live (DocsAndLessonsPainPoints, AudioAnalysis, BrowserAnalysis, DistributedArchitecturePlan, OpenFormatsResearch, StackComparison) | Aurora-rtp |
| 2026-09-28 | docs/planning/ added (ImplementationPlan, FutureSteamOSSupport); GUILaunchUX archived (stale vs. shipped Linux/Mac tray work) | Aurora-o1e |
| 2026-09-28 | HttpServerAnalysis.md archived: its Aurora-x7o "Milestone 2" tracking was agent-proposed, not owner-committed, regardless of real shipped WebUI progress | Aurora-afd |
| 2026-09-28 | docs/WebUI/ split: 4 shipped docs archived (1stPass, 2ndPass, tooltip content/analysis), 2 genuinely active docs kept; Aurora-x7o + Aurora-48x closed as agent-proposed/stale | Aurora-c90 |
| 2026-09-28 | Linux 1.0.3 bug fixes: portal wait bounds, audio ifdef guards, TEST_CASE dash names (suite 80/80; b87 + 5t2 filed as follow-ups) | Aurora-1z9, Aurora-y1q, Aurora-9yi |
| 2026-09-28 | Windows light-viz bring-up: bare-machine build recipe, DevLightTap Winsock port (was a no-op), http.server backlog resets viz page | Aurora-gj0.10, Aurora-gj0.11 |
| 2026-09-29 | Doc-linking mechanism: `Id:`/`[[id]]` convention, check-links.sh resolver + generated docs/_ids.md index, move-proof against the MacSupport.md split still to come | Aurora-lmn, Aurora-lmn.1, Aurora-lmn.2, Aurora-lmn.3 |
| 2026-09-29 | MacSupport.md split into docs/archive/mac + docs/planning/mac using the new Id:/`[[id]]` system; mbedtls pitfall extracted to lessons | Aurora-le6, Aurora-le6.1, Aurora-le6.2, Aurora-le6.3, Aurora-le6.4 |
| 2026-09-29 | WebUI docs migrated to Id:/`[[id]]` (second mechanism validation, different shape than mac); deliberate-break regression test confirmed the resolver enforces | Aurora-4ux, Aurora-4ux.1, Aurora-4ux.2, Aurora-4ux.3 |
| 2026-09-29 | ImplementationPlan.md staleness audit + split to Id:/`[[id]]`; 82% was shipped/superseded, ~140 lines genuinely still open; 6 dead external citers outside check-links.sh's scan scope fixed | Aurora-og2, Aurora-d8g |
| 2026-09-29 | Remaining 17 archive/planning docs migrated to Id:/`[[id]]` (flat tag-and-convert, ~103 citation edges, delegated to a subagent) | Aurora-w4c |
| 2026-09-29 | docs/lessons/ and docs/log/ citations repointed to Id:/`[[id]]` (27 edges); one reorg-narrative log entry deliberately left on bare paths, distinguishing lesson extracted | Aurora-0nu |
| 2026-09-29 | AGENTS.md never pointed at docs/README.md's Id:/`[[id]]` convention; fixed 5 dead docs/BrowserAnalysis.md citers it missed, added a fixed repo-wide-grep step to the reorg checklist | Aurora-6wg |
| 2026-09-29 | UpstreamFindings.md and docs/WebUI/ moved into docs/planning/ (owner-requested, against genre-based root/own-bucket calls from the 2026-09-28 pass); WebUI's existing Id:s needed no changes, only bare-path citers fixed | Aurora-7pk |
| 2026-09-29 | Linux audio sink status (Using-hint endpoint, fresh-config factory fix, bogus-falls-back-to-default surprise; 4xq + 67y filed as follow-ups) | Aurora-4vf, Aurora-4xq, Aurora-67y |
| 2026-09-29 | Windows tray on its own thread (menu no longer freezes pipeline; Mac half open); light-viz-stack devstack.py + skill | Aurora-anw, Aurora-zlw, Aurora-dp2, Aurora-df4, Aurora-beh |
| 2026-09-29 | light-viz-stack verified on Mac: config root is $TMPDIR not /tmp, Mac needs an input set (dummy); flags/relay/bridge wiring confirmed, zone map not | Aurora-df4 |
| 2026-09-29 | MacCertPrep: hardened runtime breaks Homebrew dylibs (Team ID); capture passes with disable-library-validation; bundling feasible (29 dylibs, ~40 MB); licenses mixed but GPL-3-compatible; qy5.1 closed, qy5 epic opened | Aurora-qy5, Aurora-qy5.1, Aurora-8mk.10 |
| 2026-09-30 | Mac tray on main, tick loop on worker thread (menu no longer freezes pipeline); common-modes timer rejected; traygap_mac.py | Aurora-zlw |
| 2026-09-30 | Mac cert prep without a cert: sign-notarize.sh (dry-run only), notarization plist keys + 14.2 target + verify-bundle.sh, configurable signing identity, bundled license texts; dylibs still need macOS 27 | Aurora-qy5.3, Aurora-qy5.4, Aurora-qy5.5, Aurora-qy5.7 |
| 2026-09-30 | Audio sink dropdown (enumeration endpoint, lazy DeviceField dropdown, loop-timer dead end filed as lesson; resolves 4xq for UI users) | Aurora-67y |
| 2026-09-30 | Sink dropdown fetch rework (enter+open loads, diff gate, Refresh/hint/label removal, trigger resync; 1.0.4 bump; AirPods bluez5-off diagnosis) | Aurora-apn |
| 2026-09-30 | Node-graph pipeline planning pass (React Flow decision, node inventory, UX/tooltips, live preview + fail states, YOLO/motion stretch scope); NaN-into-Color::fromHSV UB found and filed | Aurora-9ca |
| 2026-09-30 | Mac Developer ID: identity + aurora-notary set up, macOS 27 / Apple-silicon-only support decision, verify-bundle version-compare fix, Aurora 1.0.4 notarized and stapled (Gatekeeper accepts; launch/quarantine tests and publishing pending) | Aurora-qy5.8, Aurora-0ap, Aurora-pyo, Aurora-qy5 |
| 2026-09-30 | Mac first-run notification spike (8 probe variants; only a notarized build in ~/Applications got the permission request), dropped for a Mac-only NUX tip screen; qps.5 superseded, qps.6 dropped | Aurora-qps.5, Aurora-qps.6, Aurora-qps.8 |
| 2026-09-30 | Mac NUX menu-bar tip screen (MacTray.gif between Welcome and Output Connect, `.gif` content type in the embedded server) | Aurora-qps.8 |
| 2026-09-30 | Per-slice AGENTS.md folded into READMEs; new READMEs for app/mac and input/mac | Aurora-cv1 |
| 2026-09-30 | Slice READMEs made timeless; check-links scan widened to slice READMEs and root files (4 dead citations found); README close-checklist rule | Aurora-y2a |
| 2026-09-30 | Mac release zip: Aurora 1.0.4 notarized twice (second without disable-library-validation), embedded webroot and fake light-viz verified, zip renamed to Aurora_Mac_v1.0.4.zip | (no bead; 8mk.10 dropped) |
| 2026-10-01 | Aurora-9ca fix: centroid-range setter clamp + fromHSV non-finite/channel guard, 3 regression tests, core ctest 75/75; 2 lessons (clamp-NaN, setter-bypass) | Aurora-9ca |
| 2026-10-01 | Aurora-5y0 (9ca follow-up): drift/bounce NaN state self-heal + divisor guard, single guarded Color::fromNormalized (Smoother uses it), config-load clamps; NodeGraphPipeline prep-work section; core ctest 78/78 | Aurora-5y0 |
| 2026-10-01 | Aurora-tft: golden parity harness (4 video + 6 audio scenarios, 10 fixtures, regenerate via AURORA_UPDATE_GOLDEN); Mac + Windows verified, Linux pending (Aurora-a97); found Aurora-7r3 (drift never reaches output) | Aurora-tft |
| 2026-10-01 | Aurora-skv: Orchestrator::update(dt), Runtime::tickIntervalSeconds as the one tick-rate rule in all three apps, PipelineHost passes dt under its lock; parity fixtures unchanged, core 89/89, Mac app 62/62 + live viz | Aurora-skv |
| 2026-10-01 | Aurora-ta5: ParamSchema on ControlDescriptor as the one source for 12 numeric settings (UI ranges + Config clamps incl. load path), served via /api/descriptors, TuningFields renders from it; float JSON shortest-form fix; found Aurora-3qh (Mac Retina resize starves WebUI) | Aurora-ta5 |
| 2026-10-01 | Aurora-3qh: Mac SCK capture GPU-scaled via IVideoInput::setCaptureWidthHint (8x subsample, >=256px); CPU 105% -> 5.5%, WebUI lock waits 2-30s -> <1ms; Aurora-cgr remains for general tick starvation | Aurora-3qh |
| 2026-10-01 | huenicorn upstream fix branches: findings re-verified (1/2/5 corrected, new 9), chain reordered 3→1→2, fixes #3, #1, #2, #4, #5, #9, #10, #6, #7, #8 committed on fork (all 10 done); 3 grouped MR branches built; heads-up issue drafted; Aurora portal-denial stall filed; 8 lessons + 2 extended | Aurora-h45, Aurora-h45.3, Aurora-h45.1, Aurora-h45.2, Aurora-h45.4, Aurora-h45.5, Aurora-h45.6, Aurora-h45.11, Aurora-h45.7, Aurora-h45.8, Aurora-h45.9, Aurora-h45.10, Aurora-p91 |
| 2026-10-01 | Aurora-lzj (paused): toolchain spike investigated (399 KB bundle, Vite license/outDir/scripts findings, RockyRoad + SteamOS input), opt-in plan decided; change A done on Linux (embed segments, serveEmbeddedFilesAt, 6 MIME types; core 97/97, linux-app 87/87); HA prep beads + doc section; 4 lessons + 2 extended | Aurora-lzj, Aurora-pp8, Aurora-dwo, Aurora-4y9, Aurora-a0r, Aurora-d9v |
| 2026-10-01 | HA prep 1-2: Mac NSLocalNetworkUsageDescription, cpp-httplib >= 0.46 floor (fake-package test); both open pending Mac/Windows checks; huenicorn branches pushed | Aurora-pp8, Aurora-dwo, Aurora-h45.10 |
| 2026-10-01 | Aurora-4y9: OUTPUTS probe/stages table in web/ui/app.js (Hue only); 641-scenario trace compare + browser walk vs old app.js; paired-no-zone path nondeterministic in old too; 3 lessons | Aurora-4y9 |
| 2026-10-01 | Aurora-a0r: IOutput::zoneLabels + GET /api/zones/labels, Zone Mapping switched off /api/hue/channels; Linux ctest 87/87 + fake-hue browser check; Mac/Windows uncompiled; 1 lesson | Aurora-a0r |
| 2026-10-01 | Aurora-d9v (Linux half): in-process httplib ws:// echo smoke test (text/binary/256 KiB) in AuroraNetworkTests; core 98/98; Windows/Mac runs pending; 1 lesson | Aurora-d9v |
| 2026-10-01 | Node + HA prep planning: audio default semantics per platform (9k1 notes, no decision), Pipeline duplication found, HA core read (login client_id, blocking call_service, slow-reader limits), node-prep sequence + 4 new beads, ha-prep 5 beads + ha-output epic; 4 lessons | Aurora-9k1, Aurora-9ig, Aurora-c0g, Aurora-kea, Aurora-o13, Aurora-5i3, Aurora-21h, Aurora-2dz, Aurora-cyw, Aurora-d7s, Aurora-4zr |
| 2026-10-01 | Aurora-lzw: GitHub CI unblocked via PRs; Windows vcpkg deps, new mac.yml, shim version fix; Linux/Windows/Mac/web green across two PRs; 3 lessons | Aurora-lzw |
| 2026-10-01 | Aurora-9ig: Registry, Pipeline/PipelineHost, monitors/reload routes and the shared reload path moved to core/Runtime; Mac core 120/120 + mac-app 57/57 + fake-Hue live check; Windows local build, core 121/121 (CI config), live logLine/reload check, httplib include-order ODR segfault in manifest-mode core builds (Aurora-rtwh); Linux local build, core 121/121 incl. 17 Pipeline cases, live fake-Hue check; CI green on Linux/Windows/Mac on the draft PR closed it; 4 lessons + 1 extended; Aurora-9sm and Aurora-rtwh filed, Aurora-4g2 closed | Aurora-9ig, Aurora-9sm, Aurora-rtwh, Aurora-4g2 |
| 2026-10-02 | Aurora-5i3: Origin/Host write gate; stored Hue creds bound to stored bridge (one-request username leak fixed); local API rules in HA doc; Linux Network + Hue suites green, web 12/13 (demo-shim drift, pre-existing); 2 lessons | Aurora-5i3 |
| 2026-10-02 | Aurora-2dz (paused): core/Secrets OS secret store (libsecret/Keychain/Credential Manager + memory + opt-in 0600 file), URL-bound records, per-root scope; Linux 54/54 + real gnome-keyring round-trip and cross-binary pair; Mac/Windows unbuilt; fake-HA divergence filed (Aurora-nvzr); 4 lessons | Aurora-2dz, Aurora-nvzr |
