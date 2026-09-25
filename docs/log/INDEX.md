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
