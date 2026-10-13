# Aurora-wqzp.11: kiosk-Firefox mover poll-check + retry/hard-fail

Id: wqzp11-firefox-mover-retry

2026-10-13. Box: `andrew-framework-12` (i5-1334U, Ubuntu 24.04, GNOME
Wayland — same box as the wqzp.2 entry). Closed after the follow-up
below: launch retry plus mid-run abort and an ffplay mover.

## Fix (`tools/perf-harness/perf.py`, `start_firefox_mover`)

- `attempts=3`: after each 3 s settle `poll()` must be `None` or the
  attempt is dead; a dead attempt's throwaway profile is removed before
  the 1 s retry pause, so retries leak nothing.
- All attempts dead → `sys.exit` naming the exit code and refusing the
  'moving' rows, so a run can never again silently measure static.
  `main()` lets the `SystemExit` abort — no partial rows written.
- Signature backward-compatible (`start_mover` calls it bare).

## Verification (sandboxed agent shell)

- Stub probe (`/tmp`, Popen/sleep/which faked): dead,dead,alive → live
  handle after 3 launches with only the survivor profile left; all-dead
  → refusal message; healthy first launch → exactly 1 attempt.
- Real entry point, headless: installed snap Firefox exits 1 here
  (`Could not find profile folder` — snap can't see the sandbox profile
  dir) on all 3 attempts; the harness hard-failed as designed.
  `/bin/false` as the binary: exactly 2 launches for `attempts=2`,
  refusal message, zero profile leaks.
- No committed test: `tools/perf-harness/` has no maintained harness
  (only `perf.py`/`README`/`stripes.html`), so the probes stay
  throwaway under `/tmp` rather than inventing a framework.

## Left open

- A live rescue (flaky kiosk surviving on retry) needs a graphical
  session outside the sandbox, where snap Firefox stays up. Resume
  pointer: re-run `perf.py --content moving` on this box's GNOME
  session and watch for a retry saving a run.
- `bd` needs an escalated sandbox here: default bwrap fails with
  `loopback: Failed RTM_NEWADDR`.
- Aurora-wqzp.9 (Mac mover) untouched: needs-mac, this box is Linux.

## Follow-up: live run outside the sandbox

- Snap kiosk Firefox here exits 1 at 4–17 s in 6/6 launches (also by
  hand), so the 3 s launch check can't catch it; retry never fired.
- `start_mover` now prefers `start_ffplay_mover` (ffplay stripes) when
  there's no tkinter and ffplay exists; Firefox stays as fallback.
- `check_mover_alive` runs before/after each `measure`; a dead mover
  aborts the run instead of writing mislabeled 'moving' rows.
- Verified live: 3 ffplay launches all alive after 32 s; killed mover
  → abort message. Full `perf.py --content moving` run not done.

## Outcome

- Closed: the silent static-as-moving failure can't recur on Linux
  (ffplay mover, mid-run abort). Launch retry stays for the Firefox path.
- Unexplained: why snap Firefox exits 1 on a fresh profile; not chased.
- Not covered: a live-but-hidden mover (Mac WebUI tabs, Aurora-wqzp.9);
  that needs the SSE frame-change check.
