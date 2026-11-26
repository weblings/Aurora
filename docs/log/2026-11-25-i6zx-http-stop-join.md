# Quit segfault fixed: HTTP server `stop()` waits for its listen loop

Id: i6zx-http-stop-join

`Aurora-i6zx`, 2026-11-25, branch `feat/Mac1.2.1Testing`. Crash details:
[[121-mac-release-testing]].

## Change

- `Impl::stop()` (`HttpLibServerImpl.hpp`) returns only once `listen()` has
  returned, which cpp-httplib does after joining its workers. The
  `httplib::Server` is now destroyed only in `~Impl`.
- A `stop()` that beats a just-started `listen()` waits for the server to be
  running first. A `listen()` after `stop()` returns false.
- The 5 s open-stream wait is gone: waiting for `listen()` covers it. It has no
  timeout, but the app already waited on every worker when joining the listen
  thread.
- `stop()` must not be called from a handler (deadlock). No caller does. The
  three apps share this code, so their `main.cpp` files are unchanged.

## Verification

- Core `ctest`: 537/537.
- `[HttpServer]` tests, 30 repeat runs: no failure.
- Network tests under ThreadSanitizer: 37 cases, no warning.
- On the old `stop()`, the new in-flight test fails and segfaults. The other two
  new tests pass there; they guard against a hang in the new design.

## Not verified

- A notarized Mac build quitting with the web UI polling, which is part of the
  bead's acceptance. Closed on the owner's instruction without it.
- Linux and Windows.

## Follow-up

`Aurora-lyr3`: the apps call `PipelineHost::shutdown()` while the server still
serves, and a reload or resume afterwards builds a new pipeline. Reproduced with
fake outputs in a scratch `PipelineTests.cpp` (sequential cases only; a build
already in flight is read from code). Not seen on a Hue bridge. Open.

## Beads export

`bd` writes again rewrote 31 unrelated lines of `.beads/issues.jsonl` from this
machine's stale database; only the two beads' lines were kept.

## Lessons

- cpp-httplib's `Server::stop()` neither waits for the listen loop nor works before it starts ([[lesson-language-cpp]])
