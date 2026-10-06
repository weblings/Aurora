# Easy-bead trio: 2qj verify-close, ryvy ifdef, ncdd regex

Id: easy-bead-trio

2026-10-06. Three small beads in ready-order, all closed.

## Aurora-2qj (verify-only, no code): 0.0.0.0 URL already fixed

The bead's own fix (`browsableAddress()` substituting 127.0.0.1) landed 2026-09-21 with the Aurora-52o single-instance work, a day after filing. Audited all three mains: every navigable URL print (second-instance handoff, bound WebUI URL/link) goes through `browsableAddress()`; the only raw `boundBackendIP()` uses are `bind()` itself and the bind-failure message, both correct. Closed without changes.

## Aurora-ryvy (2-line fix): c0g audio test outside its ifdef

`core/tests/PipelineTests.cpp`'s live-audio-tuning test reloaded into audio unconditionally, failing the no-audio build at `REQUIRE(host.reload(...))`. Wrapped the TEST_CASE in `#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE`, matching the file's sibling guards. No-audio `AuroraPipelineTests`: 39 cases / 227 assertions green; audio build: 43 / 261 green, so the test still runs when enabled (39-vs-43 delta confirms the guard, not a deletion).

## Aurora-ncdd (script fix): gen-descriptors.py lossy regex + CRLF write

Reproduced first with a backup in place: blind regen wrote 17 entries over the checked-in 29. `ENTRY_RE` now has an optional type slot, matching both `{"key", "type", "desc"}` literals and `slider("key", "desc", ...)` helpers (verified: no other quoted-pair shapes exist in the four sources, all types lowercase). Regen then gave the right 29 entries but `cmp` failed at byte 2: the checked-in file is CRLF, Python text-mode writes LF. Write is now newline-explicit (`wb` + replace + comment saying CRLF is on purpose). Regen is `cmp`-clean against the checked-in file across two runs; `descriptors.json` itself is unmodified in git.

## Footnotes

- One self-inflicted snag: an authoring layer turned a `\n` inside a Python comment into a real newline, breaking the script mid-fix — caught by the regen run itself, repaired, then verified. Tooling-escaped string literals get byte-level verification (`od -c`/`repr`), not eyeballing.
- 1 lesson filed (CRLF codegen writes) + the stale "until ncdd lands" workaround retired from the codegen lesson; `check-lessons.sh` green.
