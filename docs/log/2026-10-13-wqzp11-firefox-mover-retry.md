# Aurora-wqzp.11: kiosk-Firefox mover poll-check + retry/hard-fail

Id: wqzp11-firefox-mover-retry

2026-10-13. Box: `andrew-framework-12` (i5-1334U, Ubuntu 24.04, GNOME
Wayland — same box as the wqzp.2 entry). Bead stays in_progress: fix
implemented and refusal-path verified, live rescue not yet seen.

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
